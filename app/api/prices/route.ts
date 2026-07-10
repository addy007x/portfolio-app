import { NextRequest } from "next/server";

// Fast-path for common tickers, so they resolve without a network round trip.
// Anything not listed here falls through to resolveCryptoId(), which uses
// CoinGecko's free /search endpoint to look it up dynamically.
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
  XAUT: "tether-gold",
};

const FX_CODES = new Set(["USD", "EUR", "JPY", "GBP", "SGD", "CNY", "AUD", "HKD", "THB"]);

// ---- In-memory TTL caches ----
// Free data providers rate-limit aggressively (CoinGecko especially), and
// every open client polls this route once a minute. Without a server-side
// cache, concurrent users quickly trip 429s and the route silently returns
// nulls — which the clients interpret as "keep the last stored price",
// leaving stale prices on screen indefinitely. These caches make each
// upstream call shared across all clients within its TTL. Per-instance and
// lost on cold start, which is fine: worst case is one extra upstream call.
interface CacheEntry<T> {
  value: T;
  expires: number;
}

function makeTtlCache<T>() {
  const map = new Map<string, CacheEntry<T>>();
  return {
    get(key: string): T | undefined {
      const e = map.get(key);
      if (!e) return undefined;
      if (Date.now() > e.expires) {
        map.delete(key);
        return undefined;
      }
      return e.value;
    },
    set(key: string, value: T, ttlMs: number) {
      map.set(key, { value, expires: Date.now() + ttlMs });
    },
  };
}

const TTL = {
  cryptoPrice: 25_000, // Binance is real-time; keep this just under the client poll
  stockPrice: 30_000,
  fxRate: 60_000, // Yahoo FX is real-time; refresh with the price polls
  fxRateFallback: 60 * 60_000, // frankfurter (ECB) only updates once per weekday
  icon: 24 * 60 * 60_000, // logos essentially never change
  cryptoId: 24 * 60 * 60_000,
  dividends: 6 * 60 * 60_000,
  binanceTickers: 25_000,
};

const cryptoPriceCache = makeTtlCache<number | null>();
const stockPriceCache = makeTtlCache<number | null>(); // keys "us:AAPL" / "th:PTT"
const fxRateCache = makeTtlCache<number>();
const iconCache = makeTtlCache<string | null>();
const cryptoIdCache = makeTtlCache<string | null>();
const dividendsCache = makeTtlCache<Array<{ exDate: string; amountPerShare: number }>>();
// One shared snapshot of every Binance USDT pair (~100KB), instead of
// per-symbol requests — a single upstream call covers all clients/symbols.
const binanceTickersCache = makeTtlCache<Map<string, number>>();

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, cache: "no-store" });
  if (!res.ok) throw new Error(`fetch failed ${res.status}`);
  return res.json();
}

async function resolveCryptoId(symbol: string): Promise<string | null> {
  if (CRYPTO_ID_MAP[symbol]) return CRYPTO_ID_MAP[symbol];
  const cached = cryptoIdCache.get(symbol);
  if (cached !== undefined) return cached;
  try {
    const data = await fetchJson(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(symbol)}`
    );
    const matches = (
      (data.coins ?? []) as Array<{ id: string; symbol: string; market_cap_rank: number | null }>
    ).filter((c) => c.symbol.toUpperCase() === symbol);
    matches.sort((a, b) => (a.market_cap_rank ?? Infinity) - (b.market_cap_rank ?? Infinity));
    const id = matches[0]?.id ?? null;
    cryptoIdCache.set(symbol, id, TTL.cryptoId);
    return id;
  } catch {
    return null;
  }
}

async function getBinanceUsdtPrices(): Promise<Map<string, number>> {
  const cached = binanceTickersCache.get("all");
  if (cached) return cached;
  const bySymbol = new Map<string, number>();
  try {
    const data = (await fetchJson("https://api.binance.com/api/v3/ticker/price")) as Array<{
      symbol: string;
      price: string;
    }>;
    for (const t of data) {
      if (t.symbol.endsWith("USDT")) {
        const base = t.symbol.slice(0, -4);
        const price = parseFloat(t.price);
        if (Number.isFinite(price)) bySymbol.set(base, price);
      }
    }
    binanceTickersCache.set("all", bySymbol, TTL.binanceTickers);
  } catch {
    // fall through with an empty map; the CoinGecko fallback covers the symbols
  }
  return bySymbol;
}

// Yahoo's currency tickers ("THB=X" is USD/THB, "EURTHB=X" etc. for the
// rest) quote in real time, unlike frankfurter's ECB reference rate which
// updates once per weekday — a stale ECB rate showed up as a systematic
// ~0.3% offset on every USD-quoted price. frankfurter stays as fallback.
function yahooFxSymbol(code: string): string {
  return code === "USD" ? "THB=X" : `${code}THB=X`;
}

async function getFxRatesToThb(codes: Set<string>): Promise<Record<string, number>> {
  const rates: Record<string, number> = { THB: 1 };
  const missing: string[] = [];
  for (const code of codes) {
    if (code === "THB") continue;
    const cached = fxRateCache.get(code);
    if (cached !== undefined) rates[code] = cached;
    else missing.push(code);
  }
  if (!missing.length) return rates;

  const fallback: string[] = [];
  await Promise.all(
    missing.map(async (code) => {
      const live = await fetchYahooPrice(yahooFxSymbol(code));
      if (live !== null && live > 0) {
        rates[code] = live;
        fxRateCache.set(code, live, TTL.fxRate);
      } else {
        fallback.push(code);
      }
    })
  );

  if (fallback.length) {
    try {
      const data = await fetchJson(
        `https://api.frankfurter.app/latest?from=THB&to=${fallback.join(",")}`
      );
      for (const code of fallback) {
        const thbToCode = data.rates?.[code];
        if (thbToCode) {
          const rate = 1 / thbToCode;
          rates[code] = rate;
          fxRateCache.set(code, rate, TTL.fxRateFallback);
        } else {
          rates[code] = NaN;
        }
      }
    } catch {
      for (const code of fallback) rates[code] = NaN;
    }
  }
  return rates;
}

// Latest traded price including pre-market/after-hours: with
// includePrePost=true the 1-minute series carries extended-hours bars, so
// the last non-null close is the freshest trade whether the exchange is in
// its regular session or not. meta.regularMarketPrice (regular session
// only) is the fallback when the series is empty or entirely null.
async function fetchYahooPrice(yahooSymbol: string): Promise<number | null> {
  try {
    const data = await fetchJson(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1m&range=1d&includePrePost=true`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    const result = data?.chart?.result?.[0];
    const closes: Array<number | null> = result?.indicators?.quote?.[0]?.close ?? [];
    for (let i = closes.length - 1; i >= 0; i--) {
      const c = closes[i];
      if (typeof c === "number" && Number.isFinite(c)) return c;
    }
    const price = result?.meta?.regularMarketPrice;
    return typeof price === "number" && Number.isFinite(price) ? price : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parse = (name: string) =>
    (searchParams.get(name) ?? "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
  const cryptoSymbols = parse("crypto");
  const stockSymbols = parse("stocks");
  const thStockSymbols = parse("thStocks");
  const fxCodes = parse("fx").filter((c) => FX_CODES.has(c));
  const dividendStockSymbols = parse("dividendStocks");

  const crypto: Record<string, number | null> = {};
  const cryptoIcons: Record<string, string | null> = {};
  const stocks: Record<string, number | null> = {};
  const thStocks: Record<string, number | null> = {};
  const fx: Record<string, number | null> = {};

  // ---- FX rates (1 unit of foreign currency -> THB) ----
  const neededFx = new Set(fxCodes);
  if (stockSymbols.length) neededFx.add("USD"); // US stock quotes are USD
  if (cryptoSymbols.length) neededFx.add("USD"); // Binance quotes are USDT (~USD)
  neededFx.delete("THB");
  const fxRatesToThb = await getFxRatesToThb(neededFx);
  for (const code of fxCodes) {
    const rate = fxRatesToThb[code];
    fx[code] = Number.isFinite(rate) ? rate : code === "THB" ? 1 : null;
  }
  const usdRate = fxRatesToThb.USD;

  // ---- Crypto prices: Binance (real-time) first, CoinGecko fallback ----
  // CoinGecko's free feed lags several minutes on volatile coins, which is
  // what made prices visibly "wrong" next to an exchange app. Binance's
  // public ticker is live and doesn't need an API key. Icons still come
  // from CoinGecko, but are cached for a day.
  if (cryptoSymbols.length) {
    const uncachedPrice: string[] = [];
    for (const sym of cryptoSymbols) {
      const cached = cryptoPriceCache.get(sym);
      if (cached !== undefined) crypto[sym] = cached;
      else uncachedPrice.push(sym);
    }

    if (uncachedPrice.length) {
      const binance = await getBinanceUsdtPrices();
      const geckoFallback: string[] = [];
      for (const sym of uncachedPrice) {
        // USDT itself has no USDT pair; it is the quote currency (~1 USD)
        const usdPrice = sym === "USDT" ? 1 : binance.get(sym);
        if (usdPrice !== undefined && Number.isFinite(usdRate)) {
          const thb = usdPrice * usdRate;
          crypto[sym] = thb;
          cryptoPriceCache.set(sym, thb, TTL.cryptoPrice);
        } else {
          geckoFallback.push(sym);
        }
      }

      if (geckoFallback.length) {
        const symbolToId = new Map<string, string>();
        await Promise.all(
          geckoFallback.map(async (sym) => {
            const id = await resolveCryptoId(sym);
            if (id) symbolToId.set(sym, id);
          })
        );
        const ids = Array.from(new Set(symbolToId.values()));
        if (ids.length) {
          try {
            const data = await fetchJson(
              `https://api.coingecko.com/api/v3/coins/markets?vs_currency=thb&ids=${ids.join(",")}`
            );
            const byId = new Map<string, { current_price: number; image: string }>(
              data.map((c: { id: string; current_price: number; image: string }) => [c.id, c])
            );
            for (const sym of geckoFallback) {
              const id = symbolToId.get(sym);
              const entry = id ? byId.get(id) : undefined;
              const price = entry?.current_price ?? null;
              crypto[sym] = price;
              cryptoPriceCache.set(sym, price, TTL.cryptoPrice);
              if (entry?.image) iconCache.set(sym, entry.image, TTL.icon);
            }
          } catch {
            for (const sym of geckoFallback) crypto[sym] = null;
          }
        } else {
          for (const sym of geckoFallback) crypto[sym] = null;
        }
      }
    }

    // Icons: serve from cache; only hit CoinGecko for symbols never seen.
    const uncachedIcons: string[] = [];
    for (const sym of cryptoSymbols) {
      const cached = iconCache.get(sym);
      if (cached !== undefined) cryptoIcons[sym] = cached;
      else uncachedIcons.push(sym);
    }
    if (uncachedIcons.length) {
      const symbolToId = new Map<string, string>();
      await Promise.all(
        uncachedIcons.map(async (sym) => {
          const id = await resolveCryptoId(sym);
          if (id) symbolToId.set(sym, id);
        })
      );
      const ids = Array.from(new Set(symbolToId.values()));
      if (ids.length) {
        try {
          const data = await fetchJson(
            `https://api.coingecko.com/api/v3/coins/markets?vs_currency=thb&ids=${ids.join(",")}`
          );
          const byId = new Map<string, { image: string }>(
            data.map((c: { id: string; image: string }) => [c.id, c])
          );
          for (const sym of uncachedIcons) {
            const id = symbolToId.get(sym);
            const icon = (id ? byId.get(id)?.image : undefined) ?? null;
            cryptoIcons[sym] = icon;
            iconCache.set(sym, icon, TTL.icon);
          }
        } catch {
          for (const sym of uncachedIcons) cryptoIcons[sym] = null;
        }
      } else {
        for (const sym of uncachedIcons) cryptoIcons[sym] = null;
      }
    }
  }

  // ---- Foreign stocks/ETFs via Yahoo Finance (USD quotes -> THB) ----
  if (stockSymbols.length) {
    await Promise.all(
      stockSymbols.map(async (sym) => {
        const cached = stockPriceCache.get(`us:${sym}`);
        if (cached !== undefined) {
          stocks[sym] = cached;
          return;
        }
        const usdPrice = await fetchYahooPrice(sym);
        const thb = usdPrice !== null && Number.isFinite(usdRate) ? usdPrice * usdRate : null;
        stocks[sym] = thb;
        stockPriceCache.set(`us:${sym}`, thb, TTL.stockPrice);
      })
    );
  }

  // ---- Thai stocks via Yahoo Finance's .BK listings (already in THB) ----
  // SET quotes on Yahoo are ~15 minutes delayed, but that still beats the
  // manual-entry-only situation these holdings had before.
  if (thStockSymbols.length) {
    await Promise.all(
      thStockSymbols.map(async (sym) => {
        const cached = stockPriceCache.get(`th:${sym}`);
        if (cached !== undefined) {
          thStocks[sym] = cached;
          return;
        }
        const yahooSymbol = sym.endsWith(".BK") ? sym : `${sym}.BK`;
        const price = await fetchYahooPrice(yahooSymbol);
        thStocks[sym] = price;
        stockPriceCache.set(`th:${sym}`, price, TTL.stockPrice);
      })
    );
  }

  // ---- Dividend history for foreign stocks/ETFs, via Yahoo Finance's
  // chart "events=div" data. Only the ex-dividend date and per-share amount
  // are available for free here — Yahoo doesn't expose the actual payment
  // date on this endpoint, so callers treat the ex-date as the best free
  // approximation of when the payout lands.
  const dividends: Record<string, Array<{ exDate: string; amountPerShare: number }>> = {};
  if (dividendStockSymbols.length) {
    await Promise.all(
      dividendStockSymbols.map(async (sym) => {
        const cached = dividendsCache.get(sym);
        if (cached !== undefined) {
          dividends[sym] = cached;
          return;
        }
        try {
          const data = await fetchJson(
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?events=div&range=10y&interval=1mo`,
            { headers: { "User-Agent": "Mozilla/5.0" } }
          );
          const events = data?.chart?.result?.[0]?.events?.dividends as
            | Record<string, { amount: number; date: number }>
            | undefined;
          const list = events
            ? Object.values(events)
                .map((e) => ({
                  exDate: new Date(e.date * 1000).toISOString().slice(0, 10),
                  amountPerShare: e.amount,
                }))
                .sort((a, b) => a.exDate.localeCompare(b.exDate))
            : [];
          dividends[sym] = list;
          dividendsCache.set(sym, list, TTL.dividends);
        } catch {
          dividends[sym] = [];
        }
      })
    );
  }

  return Response.json({ crypto, cryptoIcons, stocks, thStocks, fx, dividends });
}
