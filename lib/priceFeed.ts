import { updateHolding } from "@/lib/firestore";
import type { Holding } from "@/lib/types";

const RECOGNIZED_FX_CODES = new Set([
  "USD",
  "EUR",
  "JPY",
  "GBP",
  "SGD",
  "CNY",
  "AUD",
  "HKD",
]);

interface PricesResponse {
  crypto: Record<string, number | null>;
  cryptoIcons: Record<string, string | null>;
  stocks: Record<string, number | null>;
  fx: Record<string, number | null>;
}

// th_stock has no reliable free data source, so it always stays manual.
export function isLivePriceEligible(h: Holding): boolean {
  if (h.assetClass === "foreign_stock" || h.assetClass === "etf") return true;
  if (h.assetClass === "crypto") return true;
  if (h.assetClass === "cash") return RECOGNIZED_FX_CODES.has(h.symbol.toUpperCase());
  return false;
}

export async function refreshLivePrices(uid: string, holdings: Holding[]) {
  const eligible = holdings.filter(isLivePriceEligible);
  if (eligible.length === 0) return;

  const cryptoSymbols = Array.from(
    new Set(eligible.filter((h) => h.assetClass === "crypto").map((h) => h.symbol.toUpperCase()))
  );
  const stockSymbols = Array.from(
    new Set(
      eligible
        .filter((h) => h.assetClass === "foreign_stock" || h.assetClass === "etf")
        .map((h) => h.symbol.toUpperCase())
    )
  );
  const fxSymbols = Array.from(
    new Set(eligible.filter((h) => h.assetClass === "cash").map((h) => h.symbol.toUpperCase()))
  );

  const params = new URLSearchParams();
  if (cryptoSymbols.length) params.set("crypto", cryptoSymbols.join(","));
  if (stockSymbols.length) params.set("stocks", stockSymbols.join(","));
  if (fxSymbols.length) params.set("fx", fxSymbols.join(","));

  let data: PricesResponse;
  try {
    const res = await fetch(`/api/prices?${params.toString()}`);
    if (!res.ok) return;
    data = await res.json();
  } catch {
    return; // offline or provider down: keep last known prices
  }

  await Promise.all(
    eligible.map(async (h) => {
      const sym = h.symbol.toUpperCase();
      let price: number | null | undefined;
      let iconUrl: string | undefined;

      if (h.assetClass === "crypto") {
        price = data.crypto[sym];
        iconUrl = data.cryptoIcons[sym] ?? undefined;
      } else if (h.assetClass === "foreign_stock" || h.assetClass === "etf") {
        price = data.stocks[sym];
      } else if (h.assetClass === "cash") {
        price = data.fx[sym];
      }

      if (price == null || !Number.isFinite(price)) return; // provider miss: leave price untouched

      const patch: Partial<Holding> = { currentPrice: price, livePrice: true };
      if (iconUrl && iconUrl !== h.iconUrl) patch.iconUrl = iconUrl;
      if (price === h.currentPrice && !patch.iconUrl) return;

      await updateHolding(uid, h.id, patch);
    })
  );
}
