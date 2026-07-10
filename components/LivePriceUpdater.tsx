"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { watchHoldings, computePortfolioSummary, recordValueSnapshot } from "@/lib/firestore";
import { refreshLivePrices } from "@/lib/priceFeed";
import { usePortfolios } from "@/lib/portfolioContext";
import type { Holding } from "@/lib/types";

// Server-side TTL caches in /api/prices absorb the poll volume, so this can
// be tight without hammering the upstream providers.
const POLL_INTERVAL_MS = 30_000;

export function LivePriceUpdater() {
  const { user } = useAuth();
  const { defaultPortfolioId } = usePortfolios();
  const holdingsRef = useRef<Holding[]>([]);
  const defaultPortfolioIdRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    defaultPortfolioIdRef.current = defaultPortfolioId;
  }, [defaultPortfolioId]);

  // Set when the poll effect below mounts, so the holdings watcher can
  // trigger an immediate refresh the moment the first snapshot arrives —
  // otherwise the mount-time tick always races the (async) snapshot, loses,
  // and prices sit stale for a full poll interval after every app open.
  const tickRef = useRef<(() => void) | null>(null);
  const firstSnapshotHandled = useRef(false);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = watchHoldings(user.uid, (items) => {
      holdingsRef.current = items;
      if (!firstSnapshotHandled.current && items.length > 0) {
        firstSnapshotHandled.current = true;
        tickRef.current?.();
      }
    });
    return unsubscribe;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;

    async function tick() {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        await refreshLivePrices(uid, holdingsRef.current);
        if (holdingsRef.current.length > 0) {
          const today = new Date().toISOString().slice(0, 10);
          const byPortfolio = new Map<string, Holding[]>();
          for (const h of holdingsRef.current) {
            const pid = h.portfolioId ?? defaultPortfolioIdRef.current;
            if (!pid) continue; // migration hasn't created a default portfolio yet
            const list = byPortfolio.get(pid) ?? [];
            list.push(h);
            byPortfolio.set(pid, list);
          }
          await Promise.all(
            Array.from(byPortfolio.entries()).map(([pid, hs]) => {
              const summary = computePortfolioSummary(hs);
              return recordValueSnapshot(uid, pid, today, summary.totalValue);
            })
          );
        }
      } finally {
        inFlightRef.current = false;
      }
    }

    tickRef.current = tick;
    tick();
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      tickRef.current = null;
      clearInterval(interval);
    };
  }, [user]);

  return null;
}
