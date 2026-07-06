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

export interface RebalanceRow {
  assetClass: AssetClass;
  currentValue: number;
  currentPct: number;
  targetPct: number;
  targetValue: number;
  diffValue: number; // targetValue - currentValue: positive = buy more, negative = sell some
}

const ASSET_CLASS_ORDER: AssetClass[] = ["th_stock", "foreign_stock", "etf", "crypto", "cash"];

export function computeRebalance(
  holdings: Array<{ assetClass: AssetClass; quantity: number; currentPrice: number }>,
  weights: Record<AssetClass, number>
): { rows: RebalanceRow[]; totalValue: number } {
  const byClass = new Map<AssetClass, number>();
  let totalValue = 0;
  for (const h of holdings) {
    const v = h.quantity * h.currentPrice;
    byClass.set(h.assetClass, (byClass.get(h.assetClass) ?? 0) + v);
    totalValue += v;
  }
  const rows: RebalanceRow[] = ASSET_CLASS_ORDER.map((assetClass) => {
    const currentValue = byClass.get(assetClass) ?? 0;
    const currentPct = totalValue > 0 ? (currentValue / totalValue) * 100 : 0;
    const targetPct = (weights[assetClass] ?? 0) * 100;
    const targetValue = totalValue * (weights[assetClass] ?? 0);
    return {
      assetClass,
      currentValue,
      currentPct,
      targetPct,
      targetValue,
      diffValue: targetValue - currentValue,
    };
  });
  return { rows, totalValue };
}
