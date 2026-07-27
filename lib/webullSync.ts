import type { User } from "firebase/auth";
import { syncBrokerHoldings, type HoldingSyncResult } from "@/lib/firestore";
import { fetchFxRateToThb } from "@/lib/priceFeed";
import type { Holding } from "@/lib/types";

export interface WebullPositionSyncOutcome {
  ok: boolean;
  // Symbols the broker successfully priced this run. Callers use it to keep
  // a generic price feed from overwriting the broker's own figures — and,
  // because it is empty whenever this fails, a broker outage automatically
  // hands pricing back to that feed instead of freezing stale values.
  handledSymbols: Set<string>;
  result?: HoldingSyncResult;
  // True when retrying is pointless until configuration or credentials
  // change: no broker set up, not the designated owner, or an access token
  // that needs manual re-approval. Pollers should stop calling rather than
  // repeat a request that cannot start succeeding on its own.
  permanentlyUnavailable?: boolean;
}

const FAILED: WebullPositionSyncOutcome = { ok: false, handledSymbols: new Set() };

// Errors no amount of retrying resolves — see WebullPositionSyncOutcome.
const PERMANENT_ERRORS = new Set([
  "webull_not_configured",
  "owner_not_configured",
  "forbidden",
  "invalid_token",
  "missing_token",
  "webull_token_expired",
]);

// Mirrors the broker's positions into holdings. Shared by the periodic
// updater and any page that wants to force a refresh, so the guard rails
// below live in exactly one place.
export async function syncWebullPositions(
  user: Pick<User, "uid" | "getIdToken">,
  existing: Holding[],
  portfolioId?: string | null
): Promise<WebullPositionSyncOutcome> {
  try {
    const idToken = await user.getIdToken();
    const res = await fetch("/api/webull/positions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    const data = (await res.json()) as {
      ok: boolean;
      positions?: Array<{ symbol: string; quantity: number; costPrice: number; lastPrice: number }>;
      error?: string;
    };
    // Only a confirmed-good response may drive the sync: syncBrokerHoldings
    // deletes mirrored holdings missing from the list, so treating a failure
    // as "no positions" would wipe them out.
    if (!data.ok || !data.positions) {
      return data.error && PERMANENT_ERRORS.has(data.error)
        ? { ...FAILED, permanentlyUnavailable: true }
        : FAILED;
    }

    const usdRate = await fetchFxRateToThb("USD");
    if (!(usdRate > 1.5)) return FAILED; // 1 is fetchFxRateToThb's failure fallback

    const result = await syncBrokerHoldings(
      user.uid,
      data.positions,
      existing,
      usdRate,
      portfolioId
    );
    return {
      ok: true,
      handledSymbols: new Set(data.positions.map((p) => p.symbol.toUpperCase())),
      result,
    };
  } catch {
    return FAILED;
  }
}
