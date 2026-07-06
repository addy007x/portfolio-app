"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { watchHoldings, belongsToPortfolio } from "@/lib/firestore";
import { usePortfolios } from "@/lib/portfolioContext";
import type { Holding } from "@/lib/types";
import { ASSET_CLASS_LABEL, ASSET_CLASS_COLOR } from "@/lib/types";
import {
  REBALANCE_STRATEGIES,
  getStrategyWeights,
  computeCashFlowRebalance,
  type RebalanceStrategyId,
} from "@/lib/rebalance";
import { Card } from "@/components/Card";
import { AssetIcon } from "@/components/AssetIcon";
import { FormInput } from "@/components/Modal";
import { useCurrencyDisplay } from "@/lib/currencyDisplay";

export default function RebalancePage() {
  const { user } = useAuth();
  const { formatMoney } = useCurrencyDisplay();
  const { currentPortfolioId, defaultPortfolioId } = usePortfolios();
  const [allHoldings, setAllHoldings] = useState<Holding[]>([]);
  const [strategyId, setStrategyId] = useState<RebalanceStrategyId>("moderate");
  const [age, setAge] = useState("30");
  const [contribution, setContribution] = useState("");

  useEffect(() => {
    if (!user) return;
    return watchHoldings(user.uid, setAllHoldings);
  }, [user]);

  const holdings = allHoldings.filter((h) =>
    belongsToPortfolio(h, currentPortfolioId, defaultPortfolioId)
  );

  const strategy = REBALANCE_STRATEGIES.find((s) => s.id === strategyId) ?? REBALANCE_STRATEGIES[1];
  const weights = getStrategyWeights(strategyId, parseInt(age, 10) || 0);
  const contributionAmount = parseFloat(contribution) || 0;
  const { rows, totalValue } = computeCashFlowRebalance(holdings, weights, contributionAmount);

  return (
    <div style={{ animation: "scin 0.3s ease both" }}>
      <div className="text-[26px] font-extrabold tracking-tight mb-1 mt-1">ปรับสมดุลพอร์ต</div>
      <div className="text-[12px] mb-4" style={{ color: "var(--muted)" }}>
        Cash Flow Rebalancing — ไม่แนะนำให้ขายสินทรัพย์เดิม แต่จะบอกว่าเงินลงทุนใหม่ควรใส่ที่สินทรัพย์ไหน
        (เฉพาะสินทรัพย์ที่ถืออยู่จริง) เพื่อให้พอร์ตค่อยๆ กลับไปสมดุลตามเป้าหมาย
      </div>

      <div className="flex gap-2 overflow-x-auto mb-3 pb-1">
        {REBALANCE_STRATEGIES.map((s) => (
          <button
            key={s.id}
            onClick={() => setStrategyId(s.id)}
            className="px-3 py-1.5 rounded-[10px] text-xs font-semibold flex-none"
            style={{
              background: strategyId === s.id ? "var(--accent)" : "var(--surface2)",
              color: strategyId === s.id ? "#04120c" : "var(--text)",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {strategyId === "age" && (
        <Card className="mb-3">
          <FormInput
            label="อายุ"
            type="number"
            value={age}
            onChange={(e) => setAge(e.target.value)}
          />
        </Card>
      )}

      <Card className="mb-3">
        <FormInput
          label="เงินลงทุนใหม่ที่จะเติม (บาท)"
          type="number"
          step="any"
          placeholder="เช่น 5000"
          value={contribution}
          onChange={(e) => setContribution(e.target.value)}
        />
      </Card>

      <div className="text-[11px] mb-3" style={{ color: "var(--muted)" }}>
        {strategy.source} — เป็นแนวทางทั่วไป ไม่ใช่คำแนะนำการลงทุนเฉพาะบุคคล โปรดพิจารณาความเสี่ยงที่รับได้ของตัวเองก่อนตัดสินใจ
      </div>

      {totalValue === 0 ? (
        <div className="text-sm text-center py-8" style={{ color: "var(--muted)" }}>
          พอร์ตนี้ยังไม่มีสินทรัพย์ — ไปที่หน้า Portfolio เพื่อเพิ่มรายการ
        </div>
      ) : (
        <>
          <Card>
            <div className="text-[13px]" style={{ color: "var(--muted)" }}>
              มูลค่ารวมในพอร์ตนี้
            </div>
            <div className="text-2xl font-extrabold mt-1">{formatMoney(totalValue)}</div>
          </Card>

          <div className="flex flex-col gap-2.5 mt-3">
            {rows.map((r) => {
              const hasAllocation = r.allocate > 1;
              return (
                <Card key={r.symbol} className="!p-3.5">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-[11px] flex items-center justify-center flex-none overflow-hidden"
                      style={{ background: `${ASSET_CLASS_COLOR[r.assetClass]}22` }}
                    >
                      <AssetIcon symbol={r.symbol} assetClass={r.assetClass} iconUrl={r.iconUrl} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold truncate">{r.symbol}</div>
                      <div className="text-[11px] truncate" style={{ color: "var(--muted)" }}>
                        {ASSET_CLASS_LABEL[r.assetClass]} · ปัจจุบัน {r.currentPct.toFixed(0)}% · เป้าหมาย{" "}
                        {r.targetPct.toFixed(0)}%
                      </div>
                    </div>
                    <div className="text-right flex-none">
                      {hasAllocation ? (
                        <div className="text-xs font-bold" style={{ color: "var(--up)" }}>
                          + {formatMoney(r.allocate)}
                        </div>
                      ) : (
                        <div className="text-xs font-semibold" style={{ color: "var(--muted)" }}>
                          {contributionAmount > 0 ? "ไม่ต้องเพิ่ม" : "—"}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 mt-3">
                    <div
                      className="h-2 rounded-[6px] overflow-hidden relative"
                      style={{ background: "var(--surface2)" }}
                    >
                      <div
                        style={{
                          width: `${Math.min(100, r.currentPct)}%`,
                          height: "100%",
                          background: ASSET_CLASS_COLOR[r.assetClass],
                          borderRadius: 6,
                        }}
                      />
                      <div
                        style={{
                          position: "absolute",
                          left: `${Math.min(100, r.targetPct)}%`,
                          top: -2,
                          bottom: -2,
                          width: 2,
                          background: "var(--text)",
                        }}
                      />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
