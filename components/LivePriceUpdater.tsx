"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { watchHoldings, computePortfolioSummary, recordValueSnapshot } from "@/lib/firestore";
import { refreshLivePrices } from "@/lib/priceFeed";
import { usePortfolios } from "@/lib/portfolioContext";
import type { Holding } from "@/lib/types";

const POLL_INTERVAL_MS = 60_000;

export function LivePriceUpdater() {
  const { user } = useAuth();
  const { defaultPortfolioId } = usePortfolios();
  const holdingsRef = useRef<Holding[]>([]);
  const defaultPortfolioIdRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    defaultPortfolioIdRef.current = defaultPortfolioId;
  }, [defaultPortfolioId]);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = watchHoldings(user.uid, (items) => {
      holdingsRef.current = items;
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

    tick();
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [user]);

  return null;
}
