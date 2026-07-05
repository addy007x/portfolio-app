"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { watchDividends, addDividend, deleteDividend } from "@/lib/firestore";
import type { Dividend } from "@/lib/types";
import { Card, Icon } from "@/components/Card";
import { Modal, FormInput, SubmitButton } from "@/components/Modal";
import { formatThaiDate } from "@/lib/format";
import { useCurrencyDisplay } from "@/lib/currencyDisplay";

export default function DividendsPage() {
  const { user } = useAuth();
  const { formatMoney } = useCurrencyDisplay();
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    symbol: "",
    exDate: "",
    paymentDate: new Date().toISOString().slice(0, 10),
    amountPerShare: "",
    totalAmount: "",
  });

  useEffect(() => {
    if (!user) return;
    return watchDividends(user.uid, setDividends);
  }, [user]);

  const ytdTotal = useMemo(() => {
    const year = new Date().getFullYear();
    return dividends
      .filter((d) => new Date(d.paymentDate).getFullYear() === year)
      .reduce((sum, d) => sum + d.totalAmount, 0);
  }, [dividends]);

  const monthly = useMemo(() => {
    const year = new Date().getFullYear();
    const months = Array.from({ length: 12 }, () => 0);
    for (const d of dividends) {
      const dt = new Date(d.paymentDate);
      if (dt.getFullYear() === year) months[dt.getMonth()] += d.totalAmount;
    }
    return months;
  }, [dividends]);

  const maxMonth = Math.max(1, ...monthly);
  const monthLabels = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    await addDividend(user.uid, {
      symbol: form.symbol.toUpperCase(),
      exDate: form.exDate,
      paymentDate: form.paymentDate,
      amountPerShare: parseFloat(form.amountPerShare) || 0,
      totalAmount: parseFloat(form.totalAmount) || 0,
    });
    setForm({
      symbol: "",
      exDate: "",
      paymentDate: new Date().toISOString().slice(0, 10),
      amountPerShare: "",
      totalAmount: "",
    });
    setOpen(false);
  }

  return (
    <div style={{ animation: "scin 0.3s ease both" }}>
      <div className="flex justify-between items-start mb-4 mt-1">
        <div className="text-[26px] font-extrabold tracking-tight">เงินปันผล</div>
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
            รวมปีนี้ (YTD)
          </div>
        </div>
        <div className="text-2xl font-extrabold mt-1" style={{ color: "var(--up)" }}>
          {formatMoney(ytdTotal)}
        </div>
        <div className="flex items-end gap-2 mt-4" style={{ height: 90 }}>
          {monthly.map((v, i) => {
            const h = Math.max(6, Math.round((v / maxMonth) * 100));
            const big = v === maxMonth && v > 0;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div
                  style={{
                    width: "64%",
                    height: `${h}%`,
                    minHeight: 6,
                    borderRadius: "5px 5px 0 0",
                    background: big ? "var(--accent)" : "rgba(37,226,154,0.30)",
                    alignSelf: "flex-end",
                  }}
                />
                <span className="text-[9px]" style={{ color: "var(--muted)" }}>
                  {monthLabels[i]}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="flex flex-col gap-2.5 mt-3">
        {dividends.length === 0 && (
          <div className="text-sm text-center py-8" style={{ color: "var(--muted)" }}>
            ยังไม่มีประวัติเงินปันผล
          </div>
        )}
        {dividends.map((d) => (
          <Card key={d.id} className="!p-3.5">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-[11px] flex items-center justify-center flex-none"
                style={{ background: "var(--accent-soft)" }}
              >
                <Icon name="paid" style={{ fontSize: 19, color: "var(--accent)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold truncate">{d.symbol}</div>
                <div className="text-[11px] truncate" style={{ color: "var(--muted)" }}>
                  {formatThaiDate(d.paymentDate)}
                </div>
              </div>
              <div className="text-sm font-bold" style={{ color: "var(--up)" }}>
                {formatMoney(d.totalAmount)}
              </div>
              <button
                onClick={() => user && deleteDividend(user.uid, d.id)}
                className="flex-none ml-1"
                style={{ color: "var(--muted)" }}
              >
                <Icon name="close" style={{ fontSize: 18 }} />
              </button>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="บันทึกเงินปันผล">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <FormInput
            label="สัญลักษณ์ (Symbol)"
            required
            value={form.symbol}
            onChange={(e) => setForm({ ...form, symbol: e.target.value })}
          />
          <FormInput
            label="วันขึ้นเครื่องหมาย (Ex-date)"
            type="date"
            value={form.exDate}
            onChange={(e) => setForm({ ...form, exDate: e.target.value })}
          />
          <FormInput
            label="วันจ่ายเงินปันผล"
            type="date"
            required
            value={form.paymentDate}
            onChange={(e) => setForm({ ...form, paymentDate: e.target.value })}
          />
          <FormInput
            label="เงินปันผล/หน่วย"
            type="number"
            step="any"
            value={form.amountPerShare}
            onChange={(e) => setForm({ ...form, amountPerShare: e.target.value })}
          />
          <FormInput
            label="จำนวนเงินรวม (บาท)"
            type="number"
            step="any"
            required
            value={form.totalAmount}
            onChange={(e) => setForm({ ...form, totalAmount: e.target.value })}
          />
          <SubmitButton>บันทึก</SubmitButton>
        </form>
      </Modal>
    </div>
  );
}
