import type { AssetClass, Holding, RebalanceTarget } from "@/lib/types";

// How to close the gap between the current mix and the target mix.
//
//  dca        — spend new money only. Nothing is sold; the cash is split
//               across whatever sits below target. The gentlest option, and
//               the only one that doesn't realize gains or trigger tax.
//  sellExcess — fund the buys by trimming what's above target, leaving
//               positions already near target alone. No new money needed,
//               and fewer transactions than a full pass.
//  full       — move every position onto its exact target, however small the
//               gap. Most precise, most transactions.
export type RebalanceMode = "dca" | "sellExcess" | "full";

// Below this, a position counts as on-target. Rebalancing a 0.2% drift costs
// fees and realizes gains to fix a rounding error, so `sellExcess` ignores
// gaps this small; `full` deliberately does not.
const NEAR_TARGET_PCT = 1;

export interface RebalanceRow {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  iconUrl?: string;
  targetPct: number;
  currentPct: number;
  driftPct: number; // current - target; positive means overweight
  currentValue: number;
  targetValue: number;
  // THB to trade: positive buy, negative sell, 0 hold. Reflects the chosen
  // mode, so it is not simply targetValue - currentValue.
  action: number;
}

export interface RebalanceResult {
  totalValue: number;
  rows: RebalanceRow[];
  // The single worst gap, i.e. how far the most out-of-line position sits
  // from its target. Chosen over the summed variant because it's the figure
  // a "rebalance when drift exceeds X%" rule is naturally read against —
  // a sum grows with the number of positions and would trip that rule on a
  // portfolio where nothing is individually far off.
  maxDriftPct: number;
  // Share of the portfolio that would have to change hands to be on target
  // (half the summed absolute drift, since every overweight is matched by an
  // underweight). Kept as the "how much work is this" measure.
  totalDriftPct: number;
  buys: RebalanceRow[];
  sells: RebalanceRow[];
  totalBuy: number;
  totalSell: number;
  // Set when the mode couldn't fully close the gap — e.g. DCA money runs out
  // before every underweight position is topped up.
  shortfall: number;
}

const EMPTY: RebalanceResult = {
  totalValue: 0,
  rows: [],
  maxDriftPct: 0,
  totalDriftPct: 0,
  buys: [],
  sells: [],
  totalBuy: 0,
  totalSell: 0,
  shortfall: 0,
};

// Distributes `pool` across rows in proportion to how far each is below
// target, so the money lands where the gap is widest rather than being split
// evenly. Returns what each row should receive, keyed by symbol.
function allocateProportionally(
  gaps: Array<{ symbol: string; gap: number }>,
  pool: number
): Map<string, number> {
  const out = new Map<string, number>();
  const totalGap = gaps.reduce((s, g) => s + g.gap, 0);
  if (totalGap <= 0 || pool <= 0) return out;

  // Never overshoot: once the pool covers every gap, each row just gets its
  // gap and the remainder is left as cash rather than pushing past target.
  const scale = Math.min(1, pool / totalGap);
  for (const g of gaps) out.set(g.symbol, g.gap * scale);
  return out;
}

export function computeRebalance(
  holdings: Holding[],
  targets: RebalanceTarget[],
  mode: RebalanceMode,
  dcaAmount = 0
): RebalanceResult {
  if (!targets.length) return EMPTY;

  const priced = holdings.filter((h) => h.assetClass !== "cash" && h.quantity > 0);
  const valueOf = (symbol: string) =>
    priced
      .filter((h) => h.symbol.toUpperCase() === symbol)
      .reduce((s, h) => s + h.quantity * h.currentPrice, 0);

  // Targets drive the row set, but a holding with no target still occupies
  // real value — it must appear (target 0%) or the percentages would be
  // computed against an incomplete total and every number would be wrong.
  const targetSymbols = new Set(targets.map((t) => t.symbol.toUpperCase()));
  const untargeted = Array.from(
    new Set(priced.map((h) => h.symbol.toUpperCase()).filter((s) => !targetSymbols.has(s)))
  );

  const totalValue = priced.reduce((s, h) => s + h.quantity * h.currentPrice, 0);
  if (totalValue <= 0) return EMPTY;

  const meta = (symbol: string) => {
    const h = priced.find((x) => x.symbol.toUpperCase() === symbol);
    return {
      name: h?.name || symbol,
      assetClass: (h?.assetClass ?? "foreign_stock") as AssetClass,
      iconUrl: h?.iconUrl,
    };
  };

  // DCA aims at the portfolio as it will be once the new money is in, so the
  // target values shown must use that same total — otherwise the table would
  // contradict the buy list, promising to top a position up to a figure the
  // table calls its target while the suggestion buys past it.
  const targetBase = mode === "dca" ? totalValue + dcaAmount : totalValue;

  const rows: RebalanceRow[] = [
    ...targets.map((t) => {
      const symbol = t.symbol.toUpperCase();
      const currentValue = valueOf(symbol);
      return {
        symbol,
        ...meta(symbol),
        targetPct: t.pct,
        currentPct: (currentValue / totalValue) * 100,
        driftPct: (currentValue / totalValue) * 100 - t.pct,
        currentValue,
        targetValue: (targetBase * t.pct) / 100,
        action: 0,
      };
    }),
    ...untargeted.map((symbol) => {
      const currentValue = valueOf(symbol);
      return {
        symbol,
        ...meta(symbol),
        targetPct: 0,
        currentPct: (currentValue / totalValue) * 100,
        driftPct: (currentValue / totalValue) * 100,
        currentValue,
        targetValue: 0,
        action: 0,
      };
    }),
  ];

  const maxDriftPct = rows.reduce((m, r) => Math.max(m, Math.abs(r.driftPct)), 0);
  const totalDriftPct = rows.reduce((s, r) => s + Math.abs(r.driftPct), 0) / 2;
  let shortfall = 0;

  if (mode === "dca") {
    // New money only. targetValue already accounts for the incoming cash
    // (see targetBase), so the gap is measured straight off it.
    const gaps = rows
      .map((r) => ({ symbol: r.symbol, gap: r.targetValue - r.currentValue }))
      .filter((g) => g.gap > 0);
    const allocation = allocateProportionally(gaps, dcaAmount);
    for (const r of rows) r.action = allocation.get(r.symbol) ?? 0;

    const spent = Array.from(allocation.values()).reduce((s, v) => s + v, 0);
    const needed = gaps.reduce((s, g) => s + g.gap, 0);
    shortfall = Math.max(0, needed - spent);
  } else if (mode === "sellExcess") {
    // Trim only what is meaningfully above target, then spend exactly that
    // on what is meaningfully below — no new money, so buys are capped by
    // what the sells raise.
    for (const r of rows) {
      if (r.driftPct > NEAR_TARGET_PCT) r.action = r.targetValue - r.currentValue; // negative
    }
    const raised = rows.reduce((s, r) => s + (r.action < 0 ? -r.action : 0), 0);
    const gaps = rows
      .filter((r) => r.driftPct < -NEAR_TARGET_PCT)
      .map((r) => ({ symbol: r.symbol, gap: r.targetValue - r.currentValue }));
    const allocation = allocateProportionally(gaps, raised);
    for (const r of rows) {
      const buy = allocation.get(r.symbol);
      if (buy) r.action = buy;
    }

    const needed = gaps.reduce((s, g) => s + g.gap, 0);
    shortfall = Math.max(0, needed - raised);
  } else {
    // Full: every position moves to its exact target. Sells and buys net to
    // zero because the targets are shares of the same total.
    for (const r of rows) r.action = r.targetValue - r.currentValue;
  }

  // Round away sub-baht noise so the UI doesn't show a "buy ฿0.004".
  for (const r of rows) if (Math.abs(r.action) < 1) r.action = 0;

  const buys = rows.filter((r) => r.action > 0).sort((a, b) => b.action - a.action);
  const sells = rows.filter((r) => r.action < 0).sort((a, b) => a.action - b.action);

  return {
    totalValue,
    rows: rows.sort((a, b) => b.currentValue - a.currentValue),
    maxDriftPct,
    totalDriftPct,
    buys,
    sells,
    totalBuy: buys.reduce((s, r) => s + r.action, 0),
    totalSell: sells.reduce((s, r) => s - r.action, 0),
    shortfall,
  };
}

// Suggests a starting mix from what's already held, so the target editor
// opens with something sensible instead of a blank form the user has to fill
// from nothing. Rounded to whole percents, with the largest holding
// absorbing the rounding remainder so the total is exactly 100.
//
// Every held symbol is returned, including ones that round down to 0% — the
// editor lists them so a small position can still be given a deliberate
// target, rather than silently disappearing from the form.
export function suggestTargetsFromHoldings(holdings: Holding[]): RebalanceTarget[] {
  const priced = holdings.filter((h) => h.assetClass !== "cash" && h.quantity > 0);
  const bySymbol = new Map<string, number>();
  for (const h of priced) {
    const symbol = h.symbol.toUpperCase();
    bySymbol.set(symbol, (bySymbol.get(symbol) ?? 0) + h.quantity * h.currentPrice);
  }
  const total = Array.from(bySymbol.values()).reduce((s, v) => s + v, 0);
  if (total <= 0) return [];

  const entries = Array.from(bySymbol.entries()).sort((a, b) => b[1] - a[1]);
  const targets = entries.map(([symbol, value]) => ({
    symbol,
    pct: Math.round((value / total) * 100),
  }));
  const drift = 100 - targets.reduce((s, t) => s + t.pct, 0);
  if (targets.length && drift !== 0) targets[0].pct += drift;
  return targets;
}
