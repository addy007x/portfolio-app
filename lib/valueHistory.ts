import type { Holding, Transaction, ValueSnapshot } from "@/lib/types";
import { quantityHeldAsOf } from "@/lib/firestore";
import type { PortfolioHistory, PriceSeries } from "@/lib/priceFeed";

// Latest price at or before `ts` (series is sorted oldest-first).
function lastAtOrBefore(series: PriceSeries, ts: number): number | null {
  let lo = 0;
  let hi = series.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid][0] <= ts) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans >= 0 ? series[ans][1] : null;
}

// Reconstructs the portfolio's value curve from real market history —
// quantity held at each point in time (from the transaction ledger) times
// that instant's price — so the chart is meaningful immediately instead of
// waiting for the app to be open across multiple days to accumulate
// stored snapshots.
export function computePortfolioValueHistory(
  holdings: Holding[],
  transactions: Transaction[],
  history: PortfolioHistory,
  maxPoints = 110
): ValueSnapshot[] {
  const tsSet = new Set<number>();
  const allSeries: PriceSeries[] = [
    ...Object.values(history.stocks),
    ...Object.values(history.thStocks),
    ...Object.values(history.crypto),
    // USDT positions price directly off the FX series, so a portfolio of
    // only USDT still needs these timestamps.
    history.fxUsd,
  ];
  for (const s of allSeries) for (const [t] of s) tsSet.add(t);
  if (tsSet.size < 2) return [];

  let timestamps = Array.from(tsSet).sort((a, b) => a - b);
  if (timestamps.length > maxPoints) {
    const step = (timestamps.length - 1) / (maxPoints - 1);
    const sampled: number[] = [];
    for (let i = 0; i < maxPoints; i++) sampled.push(timestamps[Math.round(i * step)]);
    timestamps = Array.from(new Set(sampled));
  }

  // Holdings whose symbol has no transactions (created before the ledger
  // model, or edited directly) keep a constant quantity across the range.
  const symbolsWithTx = new Set(transactions.map((t) => t.symbol));

  const points: ValueSnapshot[] = [];
  for (const ts of timestamps) {
    const iso = new Date(ts).toISOString();
    const dateOnly = iso.slice(0, 10);
    let total = 0;
    for (const h of holdings) {
      const sym = h.symbol.toUpperCase();
      const qty = symbolsWithTx.has(h.symbol)
        ? quantityHeldAsOf(transactions, h.symbol, dateOnly)
        : h.quantity;
      if (qty <= 0) continue;
      let priceThb: number | null = null;
      if (h.assetClass === "foreign_stock" || h.assetClass === "etf") {
        const usd = lastAtOrBefore(history.stocks[sym] ?? [], ts);
        const fx = lastAtOrBefore(history.fxUsd, ts);
        if (usd !== null && fx !== null) priceThb = usd * fx;
      } else if (h.assetClass === "th_stock") {
        priceThb = lastAtOrBefore(history.thStocks[sym] ?? [], ts);
      } else if (h.assetClass === "crypto") {
        if (sym === "USDT") {
          priceThb = lastAtOrBefore(history.fxUsd, ts); // 1 USDT ~ 1 USD
        } else {
          const usd = lastAtOrBefore(history.crypto[sym] ?? [], ts);
          const fx = lastAtOrBefore(history.fxUsd, ts);
          if (usd !== null && fx !== null) priceThb = usd * fx;
        }
      }
      // Assets without a usable series (cash, symbols the providers don't
      // know) contribute a flat line at their current price.
      total += qty * (priceThb ?? h.currentPrice);
    }
    points.push({ id: iso, date: iso, totalValue: total });
  }
  return points;
}
