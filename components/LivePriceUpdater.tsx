"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { watchHoldings } from "@/lib/firestore";
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
