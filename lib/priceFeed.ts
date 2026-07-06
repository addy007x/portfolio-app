import { updateHolding } from "@/lib/firestore";
import type { Holding } from "@/lib/types";

export const CURRENCY_LABEL: Record<string, string> = {
  THB: "บาท (THB)",
  USD: "ดอลลาร์สหรัฐ (USD)",
};

const CURRENCY_LABEL_EN: Record<string, string> = {
  THB: "Thai Baht (THB)",
  USD: "US Dollar (USD)",
};

export function currencyLabel(code: string, language: "th" | "en"): string {
  return language === "en" ? (CURRENCY_LABEL_EN[code] ?? code) : (CURRENCY_LABEL[code] ?? code);
}

export const CURRENCY_CODES = Object.keys(CURRENCY_LABEL);

const RECOGNIZED_FX_CODES = new Set(CURRENCY_CODES.filter((c) => c !== "THB"));

export async function fetchFxRateToThb(currency: string): Promise<number> {
  if (currency === "THB") return 1;
  try {
    const res = await fetch(`/api/prices?fx=${currency}`);
    if (!res.ok) return 1;
    const data = await res.json();
    const rate = data.fx?.[currency];
    return typeof rate === "number" && Number.isFinite(rate) ? rate : 1;
  } catch {
    return 1;
  }
}

export interface DividendEvent {
  exDate: string;
  amountPerShare: number;
}

interface PricesResponse {
  crypto: Record<string, number | null>;
  cryptoIcons: Record<string, string | null>;
  stocks: Record<string, number | null>;
  fx: Record<string, number | null>;
  dividends?: Record<string, DividendEvent[]>;
}

// Real historical ex-dividend dates + per-share amounts for foreign
// stocks/ETFs (th_stock has no free data source, same limitation as live
// prices — see isLivePriceEligible below).
export async function fetchDividendHistory(
  symbols: string[]
): Promise<Record<string, DividendEvent[]>> {
  if (symbols.length === 0) return {};
  try {
    const res = await fetch(`/api/prices?dividendStocks=${symbols.join(",")}`);
    if (!res.ok) return {};
    const data: PricesResponse = await res.json();
    return data.dividends ?? {};
  } catch {
    return {};
  }
}

// Used by Earn (and anywhere else showing raw crypto quotes/logos rather
// than updating a Holding document).
export async function fetchCryptoPricesAndIcons(
  symbols: string[]
): Promise<{ prices: Record<string, number>; icons: Record<string, string> }> {
  if (symbols.length === 0) return { prices: {}, icons: {} };
  try {
    const res = await fetch(`/api/prices?crypto=${symbols.join(",")}`);
    if (!res.ok) return { prices: {}, icons: {} };
    const data: PricesResponse = await res.json();
    const prices: Record<string, number> = {};
    const icons: Record<string, string> = {};
    for (const sym of symbols) {
      const price = data.crypto[sym];
      if (typeof price === "number" && Number.isFinite(price)) prices[sym] = price;
      const icon = data.cryptoIcons[sym];
      if (icon) icons[sym] = icon;
    }
    return { prices, icons };
  } catch {
    return { prices: {}, icons: {} };
  }
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
