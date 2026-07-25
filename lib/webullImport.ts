import type { User } from "firebase/auth";
import { addTransaction, getImportedOrderIds } from "@/lib/firestore";
import { fetchFxRateToThb } from "@/lib/priceFeed";

interface RawWebullOrder {
  orderId: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  filledAt: string;
}

export interface WebullImportSummary {
  totalFound: number;
  added: number;
  skipped: number; // already imported (matched by orderId)
}

export type WebullImportOutcome =
  | { ok: true; summary: WebullImportSummary }
  | { ok: false; error: string };

// Shared by the manual "Import trades" button in Settings and the
// automatic sync on the Portfolio page — both need identical fetch +
// dedupe + write behaviour, so this is the one place it's implemented.
//
// Webull prices are USD. The app stores THB as the primary figure with
// priceUsd frozen alongside. Ideally each order would convert at the rate
// on its own fill date; only today's rate is available here, so the THB
// figure is an approximation while priceUsd stays exact.
export async function importWebullTrades(
  user: Pick<User, "uid" | "getIdToken">,
  startDate: string,
  endDate: string,
  portfolioId?: string | null
): Promise<WebullImportOutcome> {
  try {
    const idToken = await user.getIdToken();
    const res = await fetch("/api/webull/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken, startDate, endDate }),
    });
    const data = (await res.json()) as { ok: boolean; error?: string; orders?: RawWebullOrder[] };

    if (!data.ok) return { ok: false, error: data.error ?? "undefined" };

    const orders = data.orders ?? [];
    const alreadyImported = await getImportedOrderIds(user.uid, "webull");
    const fresh = orders.filter((o) => !alreadyImported.has(o.orderId));

    if (!fresh.length) {
      return { ok: true, summary: { totalFound: orders.length, added: 0, skipped: orders.length } };
    }

    const fxRate = await fetchFxRateToThb("USD");

    for (const order of fresh) {
      await addTransaction(user.uid, {
        date: order.filledAt,
        type: order.side,
        symbol: order.symbol,
        quantity: order.quantity,
        price: order.price * fxRate,
        priceUsd: order.price,
        totalValue: order.price * fxRate * order.quantity,
        source: "webull",
        externalId: order.orderId,
        ...(portfolioId ? { portfolioId } : {}),
      });
    }

    return {
      ok: true,
      summary: { totalFound: orders.length, added: fresh.length, skipped: orders.length - fresh.length },
    };
  } catch {
    return { ok: false, error: "network" };
  }
}
