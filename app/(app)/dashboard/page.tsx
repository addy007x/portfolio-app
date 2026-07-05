"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  watchHoldings,
  watchValueHistory,
  computePortfolioSummary,
  computeAllocation,
} from "@/lib/firestore";
import type { Holding, ValueSnapshot } from "@/lib/types";
import { Card, Icon } from "@/components/Card";
import { Donut } from "@/components/Donut";
import { ValueChart } from "@/components/ValueChart";
import { formatPct, formatThaiDate } from "@/lib/format";
import { useCurrencyDisplay } from "@/lib/currencyDisplay";

export default function DashboardPage() {
  const { user } = useAuth();
  const { formatMoney, formatSignedMoney } = useCurrencyDisplay();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [history, setHistory] = useState<ValueSnapshot[]>([]);

  useEffect(() => {
    if (!user) return;
    const unsub1 = watchHoldings(user.uid, setHoldings);
    const unsub2 = watchValueHistory(user.uid, (items) => setHistory([...items].reverse()));
    return () => {
      unsub1();
      unsub2();
    };
  }, [user]);

  const summary = computePortfolioSummary(holdings);
  const allocation = computeAllocation(holdings);

  return (
    <div style={{ animation: "scin 0.3s ease both" }}>
      <div className="flex justify-between items-start mb-4 mt-1">
        <div>
          <div className="text-[26px] font-extrabold tracking-tight">Dashboard</div>
          <div className="text-[13px] mt-0.5" style={{ color: "var(--muted)" }}>
            {formatThaiDate(new Date().toISOString())}
          </div>
        </div>
        <Icon name="notifications" style={{ fontSize: 24, color: "var(--muted)" }} />
      </div>

      <Card>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1.5 text-[13px]" style={{ color: "var(--muted)" }}>
            <span>มูลค่าพอร์ตทั้งหมด</span>
          </div>
          <div
            className="flex items-center gap-0.5 rounded-[9px] px-2 py-1 text-xs font-semibold"
            style={{ background: "var(--surface2)" }}
          >
            ปัจจุบัน
          </div>
        </div>
        <div className="text-[33px] font-extrabold tracking-tight mt-2">
          {formatMoney(summary.totalValue)}
        </div>
        <div
          className="font-bold text-sm mt-0.5"
          style={{ color: summary.pnl >= 0 ? "var(--up)" : "var(--down)" }}
        >
          {formatSignedMoney(summary.pnl)} ({formatPct(summary.pnlPct)})
        </div>
        <ValueChart points={history} formatMoney={formatMoney} />
      </Card>

      <div className="grid grid-cols-3 gap-2.5 mt-3">
        <Card className="!p-3">
          <div
            className="w-8 h-8 rounded-[10px] flex items-center justify-center"
            style={{ background: "rgba(37,226,154,.16)" }}
          >
            <Icon name="trending_up" style={{ fontSize: 19, color: "var(--up)" }} />
          </div>
          <div className="text-[11px] mt-2" style={{ color: "var(--muted)" }}>
            กำไรขาดทุน
          </div>
          <div
            className="text-sm font-extrabold mt-0.5"
            style={{ color: summary.pnl >= 0 ? "var(--up)" : "var(--down)" }}
          >
            {formatSignedMoney(summary.pnl)}
          </div>
          <div className="text-[10px]" style={{ color: "var(--muted)" }}>
            ({formatPct(summary.pnlPct)})
          </div>
        </Card>
        <Card className="!p-3">
          <div
            className="w-8 h-8 rounded-[10px] flex items-center justify-center"
            style={{ background: "rgba(76,141,255,.16)" }}
          >
            <Icon name="donut_small" style={{ fontSize: 19, color: "#4c8dff" }} />
          </div>
          <div className="text-[11px] mt-2" style={{ color: "var(--muted)" }}>
            ผลตอบแทน %
          </div>
          <div className="text-sm font-extrabold mt-0.5" style={{ color: "var(--up)" }}>
            {formatPct(summary.pnlPct)}
          </div>
          <div className="text-[10px]" style={{ color: "var(--muted)" }}>
            (All Time)
          </div>
        </Card>
        <Card className="!p-3">
          <div
            className="w-8 h-8 rounded-[10px] flex items-center justify-center"
            style={{ background: "rgba(155,123,255,.16)" }}
          >
            <Icon name="account_balance_wallet" style={{ fontSize: 19, color: "#9b7bff" }} />
          </div>
          <div className="text-[11px] mt-2" style={{ color: "var(--muted)" }}>
            เงินลงทุน
          </div>
          <div className="text-sm font-extrabold mt-0.5">{formatMoney(summary.totalCost)}</div>
          <div className="text-[10px]">&nbsp;</div>
        </Card>
      </div>

      <Card className="mt-3">
        <div className="text-[15px] font-bold mb-3.5">Asset Allocation</div>
        {allocation.length === 0 ? (
          <div className="text-sm py-4 text-center" style={{ color: "var(--muted)" }}>
            ยังไม่มีสินทรัพย์ — ไปที่หน้า Portfolio เพื่อเพิ่มรายการ
          </div>
        ) : (
          <div className="flex items-center gap-3.5">
            <div className="relative flex-none" style={{ width: 130, height: 130 }}>
              <Donut slices={allocation} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-[10px]" style={{ color: "var(--muted)" }}>
                  Total
                </div>
                <div className="text-sm font-extrabold">{formatMoney(summary.totalValue)}</div>
              </div>
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              {allocation.map((a) => (
                <div key={a.assetClass} className="flex items-center gap-2 text-xs">
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 3,
                      background: a.color,
                      flex: "none",
                    }}
                  />
                  <span className="flex-1">{a.name}</span>
                  <span style={{ color: "var(--muted)" }}>{formatPct(a.pct)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
