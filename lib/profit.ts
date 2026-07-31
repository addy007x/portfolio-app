import type { AssetClass, Holding, Transaction } from "@/lib/types";

// ---- Realized (closed positions) ----

export interface RealizedTrade {
  date: string; // YYYY-MM-DD
  symbol: string;
  quantity: number;
  proceeds: number; // THB received
  costBasis: number; // THB cost of the units sold
  pnl: number; // proceeds - costBasis
}

export interface MonthlyPnl {
  month: number; // 0-11
  pnl: number;
}

export interface RealizedStats {
  trades: RealizedTrade[];
  totalPnl: number;
  totalCostBasis: number; // cost of everything sold, the base for pnlPct
  pnlPct: number;
  tradeCount: number;
  avgPnlPerTrade: number;
  winRate: number; // 0-100
  // Gross profit / gross loss. Infinity when there were wins but no losses —
  // callers render that as "∞" rather than a number.
  profitFactor: number;
  monthly: MonthlyPnl[]; // always 12 entries, Jan..Dec
  bestMonth: MonthlyPnl | null;
  worstMonth: MonthlyPnl | null;
}

const EMPTY_REALIZED: RealizedStats = {
  trades: [],
  totalPnl: 0,
  totalCostBasis: 0,
  pnlPct: 0,
  tradeCount: 0,
  avgPnlPerTrade: 0,
  winRate: 0,
  profitFactor: 0,
  monthly: Array.from({ length: 12 }, (_, month) => ({ month, pnl: 0 })),
  bestMonth: null,
  worstMonth: null,
};

// Replays every buy/sell in date order, per symbol, carrying a running
// average cost — the same basis computeHoldingStats uses, so a realized
// figure here reconciles with the cost shown on the Portfolio page rather
// than disagreeing with it (which FIFO would).
//
// `year` filters which sells are counted, but the replay always starts from
// the beginning of history: the cost basis of a lot sold in 2026 depends on
// buys from earlier years, so filtering the input first would misprice it.
export function computeRealizedStats(transactions: Transaction[], year?: number): RealizedStats {
  const relevant = transactions.filter((t) => t.type === "buy" || t.type === "sell");
  if (!relevant.length) return EMPTY_REALIZED;

  const sorted = [...relevant].sort((a, b) => a.date.localeCompare(b.date));
  const positions = new Map<string, { quantity: number; costBasis: number }>();
  const trades: RealizedTrade[] = [];

  for (const t of sorted) {
    const symbol = t.symbol.toUpperCase();
    const position = positions.get(symbol) ?? { quantity: 0, costBasis: 0 };

    if (t.type === "buy") {
      position.quantity += t.quantity;
      position.costBasis += t.quantity * t.price;
      positions.set(symbol, position);
      continue;
    }

    // Sell. Selling more than the recorded holding (possible when older
    // buys were never entered) is capped, so cost basis can't go negative
    // and invent profit that never existed.
    const soldQty = Math.min(t.quantity, position.quantity);
    if (soldQty <= 0) continue;

    const avgCost = position.quantity > 0 ? position.costBasis / position.quantity : 0;
    const costBasis = soldQty * avgCost;
    const proceeds = soldQty * t.price;

    position.quantity -= soldQty;
    position.costBasis = position.quantity > 0 ? position.quantity * avgCost : 0;
    positions.set(symbol, position);

    if (year !== undefined && Number(t.date.slice(0, 4)) !== year) continue;

    trades.push({
      date: t.date,
      symbol,
      quantity: soldQty,
      proceeds,
      costBasis,
      pnl: proceeds - costBasis,
    });
  }

  if (!trades.length) return EMPTY_REALIZED;

  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const totalCostBasis = trades.reduce((s, t) => s + t.costBasis, 0);
  const wins = trades.filter((t) => t.pnl > 0);
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = trades.filter((t) => t.pnl < 0).reduce((s, t) => s - t.pnl, 0);

  const monthly: MonthlyPnl[] = Array.from({ length: 12 }, (_, month) => ({ month, pnl: 0 }));
  for (const t of trades) {
    const month = Number(t.date.slice(5, 7)) - 1;
    if (month >= 0 && month < 12) monthly[month].pnl += t.pnl;
  }

  // Only months that actually saw a sale can be "best"/"worst" — otherwise
  // an untraded month's 0 would beat a losing month and read as a real high.
  const traded = monthly.filter((m) => m.pnl !== 0);
  const bestMonth = traded.length
    ? traded.reduce((best, m) => (m.pnl > best.pnl ? m : best))
    : null;
  const worstMonth = traded.length
    ? traded.reduce((worst, m) => (m.pnl < worst.pnl ? m : worst))
    : null;

  return {
    trades,
    totalPnl,
    totalCostBasis,
    pnlPct: totalCostBasis > 0 ? (totalPnl / totalCostBasis) * 100 : 0,
    tradeCount: trades.length,
    avgPnlPerTrade: totalPnl / trades.length,
    winRate: (wins.length / trades.length) * 100,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    monthly,
    bestMonth,
    worstMonth,
  };
}

// Years that have at least one sale, newest first — drives the year picker
// so it only offers years with something to show.
export function realizedYears(transactions: Transaction[]): number[] {
  const years = new Set<number>();
  for (const t of transactions) {
    if (t.type === "sell") years.add(Number(t.date.slice(0, 4)));
  }
  return Array.from(years).sort((a, b) => b - a);
}

// ---- Unrealized (open positions) ----

// Gold-backed tokens are held as crypto in this app but are gold exposure,
// not crypto exposure — grouping them together would misstate both slices.
const GOLD_SYMBOLS = new Set(["XAUT", "PAXG", "XAU"]);

export type ProfitCategory = "stock" | "crypto" | "gold" | "cash";

export function profitCategoryOf(h: Holding): ProfitCategory {
  if (GOLD_SYMBOLS.has(h.symbol.toUpperCase())) return "gold";
  switch (h.assetClass) {
    case "crypto":
      return "crypto";
    case "cash":
      return "cash";
    default:
      return "stock"; // th_stock, foreign_stock, etf
  }
}

export interface UnrealizedHolding {
  id: string;
  symbol: string;
  name: string;
  category: ProfitCategory;
  // Kept alongside `category` because the two answer different questions:
  // category drives the gold/crypto/stock grouping, while assetClass is what
  // logo lookup needs (Thai tickers resolve under a different path than
  // foreign ones, so collapsing them would break those icons).
  assetClass: AssetClass;
  quantity: number;
  value: number; // THB at current price
  cost: number; // THB at average cost
  pnl: number;
  pnlPct: number;
  iconUrl?: string;
}

export interface CategorySlice {
  category: ProfitCategory;
  pnl: number;
  // Share of the total absolute P/L, so the bars stay meaningful when some
  // categories are down and others up (a plain share of a mixed-sign total
  // can exceed 100% or go negative).
  sharePct: number;
}

export interface UnrealizedStats {
  totalValue: number;
  totalCost: number;
  totalPnl: number;
  pnlPct: number;
  categories: CategorySlice[];
  holdings: UnrealizedHolding[]; // biggest gain first
}

export function computeUnrealizedStats(holdings: Holding[]): UnrealizedStats {
  // Cash has no cost basis to profit against, and a zero-cost row would make
  // pnlPct meaningless, so it's left out of this view entirely.
  const priced = holdings.filter(
    (h) => h.assetClass !== "cash" && h.quantity > 0 && h.avgCost > 0
  );

  const rows: UnrealizedHolding[] = priced.map((h) => {
    const value = h.quantity * h.currentPrice;
    const cost = h.quantity * h.avgCost;
    const pnl = value - cost;
    return {
      id: h.id,
      symbol: h.symbol.toUpperCase(),
      name: h.name || h.symbol.toUpperCase(),
      category: profitCategoryOf(h),
      assetClass: h.assetClass,
      quantity: h.quantity,
      value,
      cost,
      pnl,
      pnlPct: cost > 0 ? (pnl / cost) * 100 : 0,
      iconUrl: h.iconUrl,
    };
  });

  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const totalCost = rows.reduce((s, r) => s + r.cost, 0);
  const totalPnl = totalValue - totalCost;

  const byCategory = new Map<ProfitCategory, number>();
  for (const r of rows) byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + r.pnl);
  const absTotal = Array.from(byCategory.values()).reduce((s, pnl) => s + Math.abs(pnl), 0);

  const categories: CategorySlice[] = Array.from(byCategory.entries())
    .map(([category, pnl]) => ({
      category,
      pnl,
      sharePct: absTotal > 0 ? (Math.abs(pnl) / absTotal) * 100 : 0,
    }))
    .sort((a, b) => b.pnl - a.pnl);

  return {
    totalValue,
    totalCost,
    totalPnl,
    pnlPct: totalCost > 0 ? (totalPnl / totalCost) * 100 : 0,
    categories,
    holdings: rows.sort((a, b) => b.pnl - a.pnl),
  };
}
