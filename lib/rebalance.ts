import type { AssetClass } from "@/lib/types";

export type RebalanceStrategyId = "conservative" | "moderate" | "aggressive" | "age";

export interface RebalanceStrategy {
  id: RebalanceStrategyId;
  label: string;
  source: string;
}

// These are general, widely-published asset-allocation frameworks (risk-
// profile buckets and the classic "100 minus your age" rule of thumb from
// personal-finance planning), not personalized financial advice — see the
// disclaimer shown alongside them on the Rebalance page.
export const REBALANCE_STRATEGIES: RebalanceStrategy[] = [
  {
    id: "conservative",
    label: "อนุรักษ์นิยม",
    source: "แนวทางพอร์ตความเสี่ยงต่ำทั่วไป เน้นเงินสด/สินทรัพย์มั่นคงเป็นหลัก",
  },
  {
    id: "moderate",
    label: "ปานกลาง",
    source: "แนวทางพอร์ตสมดุลแบบ 60/40 ที่รู้จักกันแพร่หลายในวงการวางแผนการเงิน",
  },
  {
    id: "aggressive",
    label: "เชิงรุก",
    source: "แนวทางพอร์ตเน้นการเติบโตสำหรับนักลงทุนระยะยาวที่รับความเสี่ยงได้สูง",
  },
  {
    id: "age",
    label: "ตามอายุ",
    source: "กฎ \"100 ลบอายุ = % หุ้น\" ซึ่งเป็นหลักการจัดพอร์ตยอดนิยมที่ใช้กันทั่วไป",
  },
];

const FIXED_WEIGHTS: Record<Exclude<RebalanceStrategyId, "age">, Record<AssetClass, number>> = {
  conservative: { th_stock: 0.1, foreign_stock: 0.1, etf: 0.1, crypto: 0, cash: 0.7 },
  moderate: { th_stock: 0.2, foreign_stock: 0.2, etf: 0.15, crypto: 0.05, cash: 0.4 },
  aggressive: { th_stock: 0.25, foreign_stock: 0.3, etf: 0.2, crypto: 0.15, cash: 0.1 },
};

// Stock allocation caps at 90% (never fully 100%, even for very young
// investors) and splits proportionally across the three growth buckets;
// the rest sits in cash.
export function ageBasedWeights(age: number): Record<AssetClass, number> {
  const stockPct = Math.min(90, Math.max(0, 100 - age)) / 100;
  return {
    th_stock: stockPct * 0.3,
    foreign_stock: stockPct * 0.4,
    etf: stockPct * 0.2,
    crypto: stockPct * 0.1,
    cash: 1 - stockPct,
  };
}

export function getStrategyWeights(id: RebalanceStrategyId, age: number): Record<AssetClass, number> {
  return id === "age" ? ageBasedWeights(age) : FIXED_WEIGHTS[id];
}

export interface CashFlowHoldingInput {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  quantity: number;
  currentPrice: number;
  iconUrl?: string;
}

export interface CashFlowRow {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  iconUrl?: string;
  currentValue: number;
  currentPct: number;
  targetPct: number;
  allocate: number; // THB from the new contribution to direct into this asset
}

const ASSET_CLASS_ORDER: AssetClass[] = ["th_stock", "foreign_stock", "etf", "crypto", "cash"];

// Cash Flow Rebalancing: never recommends selling anything, and only ever
// points new money at assets the user already holds (never an abstract
// category) — so gaps are computed per held asset class, then split across
// the specific symbols in that class in proportion to how much of the class
// each symbol currently makes up.
//
// Categories the user holds nothing in are dropped entirely rather than
// shown as a placeholder, and the strategy's weights are renormalized across
// only the held categories. This keeps the invariant that displayed
// allocations always sum to exactly `contribution`: since the renormalized
// weights still sum to 1, the unclamped sum of
// (targetValueAfterContribution - currentValue) across held classes equals
// `contribution`, and clamping negative (overweight) gaps to 0 only ever
// makes the positive-gap sum >= contribution, so contribution/sumGaps is
// always <= 1.
export function computeCashFlowRebalance(
  holdings: CashFlowHoldingInput[],
  weights: Record<AssetClass, number>,
  contribution: number
): { rows: CashFlowRow[]; totalValue: number } {
  interface SymbolAgg {
    assetClass: AssetClass;
    name: string;
    iconUrl?: string;
    value: number;
  }
  const bySymbol = new Map<string, SymbolAgg>();
  const classValue = new Map<AssetClass, number>();
  let totalValue = 0;
  for (const h of holdings) {
    const v = h.quantity * h.currentPrice;
    totalValue += v;
    classValue.set(h.assetClass, (classValue.get(h.assetClass) ?? 0) + v);
    const existing = bySymbol.get(h.symbol);
    if (existing) {
      existing.value += v;
    } else {
      bySymbol.set(h.symbol, { assetClass: h.assetClass, name: h.name, iconUrl: h.iconUrl, value: v });
    }
  }

  const heldClasses = ASSET_CLASS_ORDER.filter((c) => (classValue.get(c) ?? 0) > 0);
  const rawWeightSum = heldClasses.reduce((s, c) => s + (weights[c] ?? 0), 0);
  const normalizedWeight = new Map<AssetClass, number>();
  for (const c of heldClasses) {
    normalizedWeight.set(
      c,
      rawWeightSum > 0 ? (weights[c] ?? 0) / rawWeightSum : 1 / heldClasses.length
    );
  }

  const totalAfter = totalValue + Math.max(0, contribution);
  const classGap = new Map<AssetClass, number>();
  for (const c of heldClasses) {
    const currentValue = classValue.get(c) ?? 0;
    const targetValueAfter = totalAfter * (normalizedWeight.get(c) ?? 0);
    classGap.set(c, Math.max(0, targetValueAfter - currentValue));
  }
  const sumGaps = Array.from(classGap.values()).reduce((s, g) => s + g, 0);

  const classAllocate = new Map<AssetClass, number>();
  for (const c of heldClasses) {
    const gap = classGap.get(c) ?? 0;
    let allocate = 0;
    if (contribution > 0) {
      allocate =
        sumGaps > 0
          ? gap * Math.min(1, contribution / sumGaps)
          : contribution * (normalizedWeight.get(c) ?? 0);
    }
    classAllocate.set(c, allocate);
  }

  const rows: CashFlowRow[] = [];
  for (const c of heldClasses) {
    const classCurrentValue = classValue.get(c) ?? 0;
    const targetPctForClass = (normalizedWeight.get(c) ?? 0) * 100;
    const allocateForClass = classAllocate.get(c) ?? 0;
    for (const [symbol, agg] of bySymbol) {
      if (agg.assetClass !== c) continue;
      const share = agg.value / classCurrentValue;
      rows.push({
        symbol,
        name: agg.name,
        assetClass: agg.assetClass,
        iconUrl: agg.iconUrl,
        currentValue: agg.value,
        currentPct: totalValue > 0 ? (agg.value / totalValue) * 100 : 0,
        targetPct: targetPctForClass * share,
        allocate: allocateForClass * share,
      });
    }
  }
  rows.sort((a, b) => b.allocate - a.allocate || b.currentValue - a.currentValue);

  return { rows, totalValue };
}
