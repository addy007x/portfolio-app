"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  watchEarnPositions,
  addEarnPosition,
  deleteEarnPosition,
  computeEarnSummary,
  groupEarnPositionsBySymbol,
} from "@/lib/firestore";
import type { EarnPosition } from "@/lib/types";
import { Card, Icon } from "@/components/Card";
import { AssetIcon } from "@/components/AssetIcon";
import { ValueChart } from "@/components/ValueChart";
import { Modal, FormInput, SubmitButton } from "@/components/Modal";
import { formatPct } from "@/lib/format";
import { useCurrencyDisplay } from "@/lib/currencyDisplay";
import { fetchFxRateToThb } from "@/lib/priceFeed";
import { RangeSelector } from "@/components/RangeSelector";
import { rangeStartDate, type ChartRange } from "@/lib/chartRange";

export default function EarnPage() {
  const { user } = useAuth();
  const { formatMoney, formatSignedMoney } = useCurrencyDisplay();
  const [positions, setPositions] = useState<EarnPosition[]>([]);
  const [iconMap, setIconMap] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => new Date());
  const [range, setRange] = useState<ChartRange>("24H");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    symbol: "",
    apy: "",
    principal: "",
    startDate: new Date().toISOString().slice(0, 10),
  });

  useEffect(() => {
    if (!user) return;
    return watchEarnPositions(user.uid, setPositions);
  }, [user]);

  // Ticks every second so the compounded totals visibly grow in real time.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const symbolsKey = Array.from(new Set(positions.map((p) => p.symbol))).sort().join(",");
  useEffect(() => {
    const symbols = symbolsKey ? symbolsKey.split(",") : [];
    if (symbols.length === 0) return;
    fetch(`/api/prices?crypto=${symbols.join(",")}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.cryptoIcons) return;
        setIconMap((prev) => {
          const next = { ...prev };
          for (const sym of symbols) {
            const url = data.cryptoIcons[sym];
            if (url) next[sym] = url;
          }
          return next;
        });
      })
      .catch(() => {});
  }, [symbolsKey]);

  const summary = computeEarnSummary(positions, now, rangeStartDate(range, now));
  const groups = groupEarnPositionsBySymbol(positions, now);

  async function handleDeleteGroup(positionIds: string[]) {
    if (!user) return;
    await Promise.all(positionIds.map((id) => deleteEarnPosition(user.uid, id)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    try {
      const rate = await fetchFxRateToThb("USD");
      await addEarnPosition(user.uid, {
        symbol: form.symbol.toUpperCase(),
        apy: parseFloat(form.apy) || 0,
        principal: (parseFloat(form.principal) || 0) * rate,
        startDate: form.startDate,
      });
      setForm({
        symbol: "",
        apy: "",
        principal: "",
        startDate: new Date().toISOString().slice(0, 10),
      });
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ animation: "scin 0.3s ease both" }}>
      <div className="flex justify-between items-start mb-4 mt-1">
        <div className="text-[26px] font-extrabold tracking-tight">Crypto Earn</div>
        <button
          onClick={() => setOpen(true)}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: "var(--accent)" }}
        >
          <Icon name="add" style={{ fontSize: 22, color: "#04120c" }} />
        </button>
      </div>

      <Card>
        <div className="flex justify-between items-center">
          <div className="text-[13px]" style={{ color: "var(--muted)" }}>
            มูลค่ารวมใน Earn
          </div>
          <RangeSelector value={range} onChange={setRange} />
        </div>
        <div className="text-[31px] font-extrabold tracking-tight mt-1.5">
          {formatMoney(summary.totalValue)}
        </div>
        <div className="font-bold text-sm mt-0.5" style={{ color: "var(--up)" }}>
          {formatSignedMoney(summary.totalGain)} ({formatPct(summary.totalGainPct)})
        </div>
        <ValueChart
          points={summary.history}
          formatMoney={formatMoney}
          emptyMessage="เพิ่มรายการใน Earn เพื่อดูกราฟดอกเบี้ยทบต้น"
        />
      </Card>

      <div className="text-sm font-semibold mt-4 mb-2.5" style={{ color: "var(--muted)" }}>
        รายการ Earn
      </div>

      <div className="flex flex-col gap-2.5">
        {positions.length === 0 && (
          <div className="text-sm text-center py-8" style={{ color: "var(--muted)" }}>
            ยังไม่มีรายการใน Earn กดปุ่ม + เพื่อเพิ่มรายการแรก
          </div>
        )}
        {groups.map((g) => {
          const gain = g.totalValue - g.totalPrincipal;
          return (
            <Card key={g.symbol} className="!p-3.5">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-[11px] flex items-center justify-center flex-none overflow-hidden"
                  style={{ background: "var(--pal-crypto)22" }}
                >
                  <AssetIcon symbol={g.symbol} assetClass="crypto" iconUrl={iconMap[g.symbol]} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">{g.symbol}</div>
                  <div className="text-[11px] truncate" style={{ color: "var(--muted)" }}>
                    Flexible {g.apy}% APY
                    {g.positionIds.length > 1 && ` · รวม ${g.positionIds.length} รายการ`}
                  </div>
                </div>
                <div className="text-right flex-none">
                  <div className="text-sm font-bold">{formatMoney(g.totalValue)}</div>
                  <div className="text-[11px] font-semibold" style={{ color: "var(--up)" }}>
                    {formatSignedMoney(gain)}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteGroup(g.positionIds)}
                  className="flex-none ml-1"
                  style={{ color: "var(--muted)" }}
                >
                  <Icon name="close" style={{ fontSize: 18 }} />
                </button>
              </div>
            </Card>
          );
        })}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="เพิ่มสินทรัพย์ใน Earn">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <FormInput
            label="สัญลักษณ์ (เช่น USDT, BTC, ETH)"
            required
            value={form.symbol}
            onChange={(e) => setForm({ ...form, symbol: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <FormInput
              label="APY (%)"
              type="number"
              step="any"
              required
              value={form.apy}
              onChange={(e) => setForm({ ...form, apy: e.target.value })}
            />
            <FormInput
              label="จำนวนเงิน (USD)"
              type="number"
              step="any"
              required
              value={form.principal}
              onChange={(e) => setForm({ ...form, principal: e.target.value })}
            />
          </div>
          <FormInput
            label="วันที่เริ่ม"
            type="date"
            required
            value={form.startDate}
            onChange={(e) => setForm({ ...form, startDate: e.target.value })}
          />
          <div className="text-[11px]" style={{ color: "var(--muted)" }}>
            ระบบคำนวณดอกเบี้ยทบต้นรายวันจาก APY ที่กรอก (จำลอง ไม่ใช่การฝากจริง)
          </div>
          <SubmitButton disabled={submitting}>
            {submitting ? "กำลังบันทึก..." : "เพิ่มสินทรัพย์ใน Earn"}
          </SubmitButton>
        </form>
      </Modal>
    </div>
  );
}
