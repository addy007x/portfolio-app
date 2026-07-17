"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { watchPriceAlerts, updatePriceAlert, getUserProfile } from "@/lib/firestore";
import { fetchNativeQuotes } from "@/lib/priceFeed";
import type { PriceAlert } from "@/lib/types";

const POLL_INTERVAL_MS = 60_000;
// Once fired, an alert stays quiet for this long so a price oscillating
// around the level doesn't spam LINE.
const COOLDOWN_MS = 6 * 60 * 60_000;

function quoteUnit(source: PriceAlert["source"]): string {
  return source === "crypto" ? "USDT" : source === "us" ? "USD" : "THB";
}

// Checks the user's price alerts against live native-currency quotes while
// the app is open, and pushes a LINE message when a level is hit. This is a
// client-side watcher — there is no always-on server in this deployment, so
// alerts only fire while the app is running somewhere (phone/desktop tab).
export function AlertWatcher() {
  const { user } = useAuth();
  const alertsRef = useRef<PriceAlert[]>([]);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = watchPriceAlerts(user.uid, (items) => {
      alertsRef.current = items;
    });
    return unsubscribe;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;

    async function tick() {
      if (inFlightRef.current) return;
      const now = Date.now();
      const due = alertsRef.current.filter(
        (a) => !a.lastFiredMs || now - a.lastFiredMs > COOLDOWN_MS
      );
      if (due.length === 0) return;
      inFlightRef.current = true;
      try {
        const reqs = Array.from(
          new Map(due.map((a) => [`${a.symbol}:${a.source}`, { symbol: a.symbol, source: a.source }])).values()
        );
        const quotes = await fetchNativeQuotes(reqs);
        const fired = due.filter((a) => {
          const price = quotes[a.symbol];
          if (price == null || !Number.isFinite(price)) return false;
          return a.direction === "above" ? price >= a.level : price <= a.level;
        });
        if (fired.length === 0) return;

        const profile = await getUserProfile(uid);
        for (const a of fired) {
          const price = quotes[a.symbol] as number;
          await updatePriceAlert(uid, a.id, { lastFiredMs: Date.now() });
          if (profile?.lineToken && profile?.lineUserId) {
            const unit = quoteUnit(a.source);
            const arrow = a.direction === "above" ? "🚀" : "📉";
            const message =
              `${arrow} ${a.symbol}: ${a.label}\n` +
              `ราคาปัจจุบัน ${price.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${unit} ` +
              `(ระดับที่ตั้งไว้ ${a.level.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${unit})`;
            await fetch("/api/line-push", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                token: profile.lineToken,
                userId: profile.lineUserId,
                message,
              }),
            }).catch(() => {});
          }
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
