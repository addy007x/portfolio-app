import { NextRequest } from "next/server";

// Common crypto ticker -> CoinGecko id. CoinGecko has no free ticker-search
// endpoint, so unlisted tickers just fall back to the manual price the user
// entered (see lib/priceFeed.ts).
const CRYPTO_ID_MAP: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  USDT: "tether",
  USDC: "usd-coin",
  BNB: "binancecoin",
  SOL: "solana",
  XRP: "ripple",
  ADA: "cardano",
  DOGE: "dogecoin",
  MATIC: "matic-network",
  DOT: "polkadot",
  LTC: "litecoin",
  TRX: "tron",
  AVAX: "avalanche-2",
  LINK: "chainlink",
  ATOM: "cosmos",
  SHIB: "shiba-inu",
  BCH: "bitcoin-cash",
  XLM: "stellar",
  UNI: "uniswap",
};

const FX_CODES = new Set(["USD", "EUR", "JPY", "GBP", "SGD", "CNY", "AUD", "HKD", "THB"]);

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`fetch failed ${res.status}`);
  return res.json();
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cryptoSymbols = (searchParams.get("crypto") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const stockSymbols = (searchParams.get("stocks") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const fxCodes = (searchParams.get("fx") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((c) => FX_CODES.has(c));

  const crypto: Record<string, number | null> = {};
  const cryptoIcons: Record<string, string | null> = {};
  const stocks: Record<string, number | null> = {};
  const fx: Record<string, number | null> = {};

  // ---- Crypto prices + icons via CoinGecko ----
  const cryptoIds = cryptoSymbols
    .map((sym) => CRYPTO_ID_MAP[sym])
    .filter((id): id is string => Boolean(id));
  if (cryptoIds.length) {
    try {
      const data = await fetchJson(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=thb&ids=${cryptoIds.join(",")}`
      );
      const byId = new Map<string, { current_price: number; image: string }>(
        data.map((c: { id: string; current_price: number; image: string }) => [c.id, c])
      );
      for (const sym of cryptoSymbols) {
        const id = CRYPTO_ID_MAP[sym];
        const entry = id ? byId.get(id) : undefined;
        crypto[sym] = entry?.current_price ?? null;
        cryptoIcons[sym] = entry?.image ?? null;
      }
    } catch {
      for (const sym of cryptoSymbols) {
        crypto[sym] = null;
        cryptoIcons[sym] = null;
      }
    }
  } else {
    for (const sym of cryptoSymbols) {
      crypto[sym] = null;
      cryptoIcons[sym] = null;
    }
  }

  // ---- FX rates (1 unit of foreign currency -> THB) ----
  const neededFx = new Set(fxCodes);
  if (stockSymbols.length) neededFx.add("USD"); // stock quotes assumed USD
  neededFx.delete("THB");
  const fxRatesToThb: Record<string, number> = { THB: 1 };
  if (neededFx.size) {
    try {
      const codes = Array.from(neededFx).join(",");
      const data = await fetchJson(
        `https://api.frankfurter.app/latest?from=THB&to=${codes}`
      );
      for (const code of neededFx) {
        const thbToCode = data.rates?.[code];
        fxRatesToThb[code] = thbToCode ? 1 / thbToCode : NaN;
      }
    } catch {
      for (const code of neededFx) fxRatesToThb[code] = NaN;
    }
  }
  for (const code of fxCodes) {
    const rate = fxRatesToThb[code];
    fx[code] = Number.isFinite(rate) ? rate : code === "THB" ? 1 : null;
  }

  // ---- Foreign stocks/ETFs via Yahoo Finance, converted to THB ----
  if (stockSymbols.length) {
    const usdRate = fxRatesToThb.USD;
    await Promise.all(
      stockSymbols.map(async (sym) => {
        try {
          const data = await fetchJson(
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}`,
            { headers: { "User-Agent": "Mozilla/5.0" } }
          );
          const usdPrice = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
          stocks[sym] =
            typeof usdPrice === "number" && Number.isFinite(usdRate)
              ? usdPrice * usdRate
              : null;
        } catch {
          stocks[sym] = null;
        }
      })
    );
  }

  return Response.json({ crypto, cryptoIcons, stocks, fx });
}
