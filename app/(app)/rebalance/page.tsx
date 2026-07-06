"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { watchHoldings, belongsToPortfolio } from "@/lib/firestore";
import { usePortfolios } from "@/lib/portfolioContext";
import type { Holding } from "@/lib/types";
import { ASSET_CLASS_LABEL, ASSET_CLASS_COLOR, ASSET_CLASS_ICON } from "@/lib/types";
import {
  REBALANCE_STRATEGIES,
  getStrategyWeights,
  computeRebalance,
  type RebalanceStrategyId,
} from "@/lib/rebalance";
import { Card, Icon } from "@/components/Card";
import { FormInput } from "@/components/Modal";
import { useCurrencyDisplay } from "@/lib/currencyDisplay";

export default function RebalancePage() {
  const { user } = useAuth();
  const { formatMoney } = useCurrencyDisplay();
  const { currentPortfolioId, defaultPortfolioId } = usePortfolios();
  const [allHoldings, setAllHoldings] = useState<Holding[]>([]);
  const [strategyId, setStrategyId] = useState<RebalanceStrategyId>("moderate");
  const [age, setAge] = useState("30");

  useEffect(() => {
    if (!user) return;
    return watchHoldings(user.uid, setAllHoldings);
  }, [user]);

  const holdings = allHoldings.filter((h) =>
    belongsToPortfolio(h, currentPortfolioId, defaultPortfolioId)
  );

  const strategy = REBALANCE_STRATEGIES.find((s) => s.id === strategyId) ?? REBALANCE_STRATEGIES[1];
  const weights = getStrategyWeights(strategyId, parseInt(age, 10) || 0);
  const { rows, totalValue } = computeRebalance(holdings, weights);

  return (
    <div style={{ animation: "scin 0.3s ease both" }}>
      <div className="text-[26px] font-extrabold tracking-tight mb-4 mt-1">ปรับสมดุลพอร์ต</div>

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
              const isBuy = r.diffValue > 1;
              const isSell = r.diffValue < -1;
              return (
                <Card key={r.assetClass} className="!p-3.5">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-[11px] flex items-center justify-center flex-none"
                      style={{ background: `${ASSET_CLASS_COLOR[r.assetClass]}22` }}
                    >
                      <Icon
                        name={ASSET_CLASS_ICON[r.assetClass]}
                        style={{ fontSize: 19, color: ASSET_CLASS_COLOR[r.assetClass] }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold truncate">{ASSET_CLASS_LABEL[r.assetClass]}</div>
                      <div className="text-[11px] truncate" style={{ color: "var(--muted)" }}>
                        ปัจจุบัน {r.currentPct.toFixed(0)}% · เป้าหมาย {r.targetPct.toFixed(0)}%
                      </div>
                    </div>
                    <div className="text-right flex-none">
                      {isBuy && (
                        <div className="text-xs font-bold" style={{ color: "var(--up)" }}>
                          ซื้อเพิ่ม {formatMoney(r.diffValue)}
                        </div>
                      )}
                      {isSell && (
                        <div className="text-xs font-bold" style={{ color: "var(--down)" }}>
                          ขายออก {formatMoney(-r.diffValue)}
                        </div>
                      )}
                      {!isBuy && !isSell && (
                        <div className="text-xs font-semibold" style={{ color: "var(--muted)" }}>
                          สมดุลแล้ว
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
