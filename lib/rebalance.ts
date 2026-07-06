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

export interface CashFlowRow {
  assetClass: AssetClass;
  currentValue: number;
  currentPct: number;
  targetPct: number;
  allocate: number; // THB from the new contribution to direct into this class
}

const ASSET_CLASS_ORDER: AssetClass[] = ["th_stock", "foreign_stock", "etf", "crypto", "cash"];

// Cash Flow Rebalancing: never recommends selling anything. Instead, a new
// contribution is split across asset classes proportional to how far each
// is below its target value once that contribution is added — so the
// portfolio drifts back toward target over time purely through where new
// money goes, which is the whole point of the technique (avoids the taxes/
// fees a sell-and-rebuy rebalance would trigger).
//
// Because target weights sum to 1, the unclamped sum of
// (targetValueAfterContribution - currentValue) across all classes always
// equals exactly `contribution`. Clamping negative (overweight) gaps to 0
// before normalizing means the positive-gap sum is always >= contribution,
// so scaling by contribution/sumGaps never allocates more than was put in.
export function computeCashFlowRebalance(
  holdings: Array<{ assetClass: AssetClass; quantity: number; currentPrice: number }>,
  weights: Record<AssetClass, number>,
  contribution: number
): { rows: CashFlowRow[]; totalValue: number } {
  const byClass = new Map<AssetClass, number>();
  let totalValue = 0;
  for (const h of holdings) {
    const v = h.quantity * h.currentPrice;
    byClass.set(h.assetClass, (byClass.get(h.assetClass) ?? 0) + v);
    totalValue += v;
  }
  const totalAfter = totalValue + Math.max(0, contribution);

  const gaps = ASSET_CLASS_ORDER.map((assetClass) => {
    const currentValue = byClass.get(assetClass) ?? 0;
    const targetWeight = weights[assetClass] ?? 0;
    const targetValueAfter = totalAfter * targetWeight;
    return {
      assetClass,
      currentValue,
      targetWeight,
      gap: Math.max(0, targetValueAfter - currentValue),
    };
  });
  const sumGaps = gaps.reduce((s, g) => s + g.gap, 0);

  const rows: CashFlowRow[] = gaps.map((g) => {
    const currentPct = totalValue > 0 ? (g.currentValue / totalValue) * 100 : 0;
    const targetPct = g.targetWeight * 100;
    let allocate = 0;
    if (contribution > 0) {
      allocate = sumGaps > 0 ? g.gap * Math.min(1, contribution / sumGaps) : contribution * g.targetWeight;
    }
    return { assetClass: g.assetClass, currentValue: g.currentValue, currentPct, targetPct, allocate };
  });
  return { rows, totalValue };
}
