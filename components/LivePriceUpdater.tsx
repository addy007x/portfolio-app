"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { watchHoldings, computePortfolioSummary, recordValueSnapshot } from "@/lib/firestore";
import { refreshLivePrices } from "@/lib/priceFeed";
import { syncWebullPositions } from "@/lib/webullSync";
import { importWebullTrades } from "@/lib/webullImport";
import { usePortfolios } from "@/lib/portfolioContext";
import type { Holding } from "@/lib/types";

// Server-side TTL caches in /api/prices absorb the poll volume, so this can
// be tight without hammering the upstream providers.
const POLL_INTERVAL_MS = 30_000;

// Trade history is imported far less often than prices are refreshed: fills
// are occasional, each check is an un-cached round trip to the broker, and
// nothing in the UI depends on catching one within seconds.
const TRADE_IMPORT_EVERY_N_TICKS = 10; // ~5 minutes

// Matches the fixed anchor the Portfolio page used, and for the same reason:
// a `new Date()` computed per call would narrow the window to just today and
// miss fills from any day the app wasn't open. Older trades came in through
// the one-time manual import in Settings.
const TRADE_IMPORT_SINCE = "2026-07-25";

export function LivePriceUpdater() {
  const { user } = useAuth();
  const { defaultPortfolioId } = usePortfolios();
  const holdingsRef = useRef<Holding[]>([]);
  const defaultPortfolioIdRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  // Starts at the threshold so the first tick imports immediately instead of
  // waiting out a full interval after the app opens.
  const tradeTickRef = useRef(TRADE_IMPORT_EVERY_N_TICKS);
  // Latches once the broker says retrying is futile, so users without Webull
  // configured don't pay for a failed request on every poll.
  const brokerDisabledRef = useRef(false);

  useEffect(() => {
    defaultPortfolioIdRef.current = defaultPortfolioId;
  }, [defaultPortfolioId]);

  // Set when the poll effect below mounts, so the holdings watcher can
  // trigger an immediate refresh the moment the first snapshot arrives —
  // otherwise the mount-time tick always races the (async) snapshot, loses,
  // and prices sit stale for a full poll interval after every app open.
  const tickRef = useRef<(() => void) | null>(null);
  const firstSnapshotHandled = useRef(false);
  // Whether the holdings subscription has delivered anything at all. The
  // broker sync MUST NOT run before this: it matches broker positions
  // against `holdingsRef` by symbol, so running it against a still-empty
  // list makes every position look new and creates a duplicate holding for
  // each one. Tracked separately from firstSnapshotHandled because that only
  // fires for non-empty snapshots, which would leave a genuinely empty
  // account never syncing at all.
  const snapshotArrived = useRef(false);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = watchHoldings(user.uid, (items) => {
      holdingsRef.current = items;
      const isFirst = !snapshotArrived.current;
      snapshotArrived.current = true;
      // Kick a tick as soon as real data lands, so the mount-time tick
      // losing the race to the (async) snapshot doesn't leave prices stale
      // for a full interval.
      if (isFirst || (!firstSnapshotHandled.current && items.length > 0)) {
        firstSnapshotHandled.current = true;
        tickRef.current?.();
      }
    });
    return unsubscribe;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const currentUser = user; // narrowed for the closure below
    const uid = currentUser.uid;

    async function tick() {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        // Broker first, so its own account figures (quantity, cost, live
        // price) win, then the generic feed fills in everything the broker
        // doesn't cover — crypto, Thai stocks, cash. Running this every tick
        // rather than once per page view is what keeps the values matching
        // the broker while the app is left open.
        //
        // Skipped entirely once the broker reports a condition retrying can't
        // fix (not configured, wrong owner, token needs re-approval) — for
        // users without Webull that would otherwise be a failed request every
        // poll, forever.
        // snapshotArrived gate: see its declaration. Without it the
        // mount-time tick syncs against an empty holdings list and duplicates
        // every broker position.
        const broker =
          brokerDisabledRef.current || !snapshotArrived.current
            ? null
            : await syncWebullPositions(
                currentUser,
                holdingsRef.current,
                defaultPortfolioIdRef.current
              );
        if (broker?.permanentlyUnavailable) brokerDisabledRef.current = true;

        await refreshLivePrices(uid, holdingsRef.current, broker?.handledSymbols);

        // Only meaningful once the broker sync is working; skipped entirely
        // for users without Webull configured (ok is false), so this never
        // fires pointless requests for them.
        if (broker?.ok) {
          tradeTickRef.current += 1;
          if (tradeTickRef.current >= TRADE_IMPORT_EVERY_N_TICKS) {
            tradeTickRef.current = 0;
            await importWebullTrades(
              currentUser,
              TRADE_IMPORT_SINCE,
              new Date().toISOString().slice(0, 10),
              defaultPortfolioIdRef.current
            );
          }
        }

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
