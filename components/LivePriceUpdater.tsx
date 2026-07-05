"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { watchHoldings, computePortfolioSummary, recordValueSnapshot } from "@/lib/firestore";
import { refreshLivePrices } from "@/lib/priceFeed";
import type { Holding } from "@/lib/types";

const POLL_INTERVAL_MS = 60_000;

export function LivePriceUpdater() {
  const { user } = useAuth();
  const holdingsRef = useRef<Holding[]>([]);
  const inFlightRef = useRef(false);

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
          const summary = computePortfolioSummary(holdingsRef.current);
          await recordValueSnapshot(uid, today, summary.totalValue);
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
