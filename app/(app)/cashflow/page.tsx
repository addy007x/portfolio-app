"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { watchCashflow, addCashflowEntry, deleteCashflowEntry } from "@/lib/firestore";
import type { CashflowEntry, CashflowType } from "@/lib/types";
import { Card, Icon } from "@/components/Card";
import { Modal, FormInput, FormSelect, SubmitButton } from "@/components/Modal";
import { useCurrencyDisplay } from "@/lib/currencyDisplay";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export default function CashflowPage() {
  const { user } = useAuth();
  const { formatMoney, formatSignedMoney } = useCurrencyDisplay();
  const [entries, setEntries] = useState<CashflowEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    month: currentMonth(),
    category: "",
    type: "expense" as CashflowType,
    amount: "",
  });

  useEffect(() => {
    if (!user) return;
    return watchCashflow(user.uid, setEntries);
  }, [user]);

  const month = currentMonth();
  const monthEntries = useMemo(() => entries.filter((e) => e.month === month), [entries, month]);
  const income = monthEntries.filter((e) => e.type === "income").reduce((s, e) => s + e.amount, 0);
  const expense = monthEntries.filter((e) => e.type === "expense").reduce((s, e) => s + e.amount, 0);
  const net = income - expense;

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of monthEntries.filter((e) => e.type === "expense")) {
      map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
    }
    const total = Array.from(map.values()).reduce((s, v) => s + v, 0) || 1;
    return Array.from(map.entries())
      .map(([category, amount]) => ({ category, amount, pct: (amount / total) * 100 }))
      .sort((a, b) => b.amount - a.amount);
  }, [monthEntries]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    await addCashflowEntry(user.uid, {
      month: form.month,
      category: form.category,
      type: form.type,
      amount: parseFloat(form.amount) || 0,
    });
    setForm({ month: currentMonth(), category: "", type: "expense", amount: "" });
    setOpen(false);
  }

  return (
    <div style={{ animation: "scin 0.3s ease both" }}>
      <div className="flex justify-between items-start mb-4 mt-1">
        <div className="text-[26px] font-extrabold tracking-tight">กระแสเงินสด</div>
        <button
          onClick={() => setOpen(true)}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: "var(--accent)" }}
        >
          <Icon name="add" style={{ fontSize: 22, color: "#04120c" }} />
        </button>
      </div>

      <Card>
        <div className="text-[13px]" style={{ color: "var(--muted)" }}>
          กระแสเงินสดเดือนนี้
        </div>
        <div
          className="text-2xl font-extrabold mt-1"
          style={{ color: net >= 0 ? "var(--up)" : "var(--down)" }}
        >
          {formatSignedMoney(net)}
        </div>
        <div className="flex gap-2.5 mt-3.5">
          <div className="flex-1 rounded-[12px] p-3" style={{ background: "var(--surface2)" }}>
            <div className="text-xs" style={{ color: "var(--muted)" }}>
              รายรับ
            </div>
            <div className="font-extrabold text-base mt-0.5">{formatMoney(income)}</div>
          </div>
          <div className="flex-1 rounded-[12px] p-3" style={{ background: "var(--surface2)" }}>
            <div className="text-xs" style={{ color: "var(--muted)" }}>
              รายจ่าย
            </div>
            <div className="font-extrabold text-base mt-0.5">{formatMoney(expense)}</div>
          </div>
        </div>
      </Card>

      {byCategory.length > 0 && (
        <Card className="mt-3">
          <div className="text-sm font-bold mb-3">หมวดรายจ่าย</div>
          <div className="flex flex-col gap-3">
            {byCategory.map((c) => (
              <div key={c.category}>
                <div className="flex justify-between text-xs mb-1">
                  <span>{c.category}</span>
                  <span style={{ color: "var(--muted)" }}>{formatMoney(c.amount)}</span>
                </div>
                <div
                  className="h-1.5 rounded-[4px] overflow-hidden"
                  style={{ background: "var(--surface2)" }}
                >
                  <div
                    style={{
                      width: `${c.pct}%`,
                      height: "100%",
                      background: "var(--accent)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex flex-col gap-2.5 mt-3">
        {monthEntries.length === 0 && (
          <div className="text-sm text-center py-8" style={{ color: "var(--muted)" }}>
            ยังไม่มีรายการเดือนนี้
          </div>
        )}
        {monthEntries.map((e) => (
          <Card key={e.id} className="!p-3.5">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-[11px] flex items-center justify-center flex-none"
                style={{ background: e.type === "income" ? "rgba(37,226,154,.16)" : "rgba(255,107,107,.16)" }}
              >
                <Icon
                  name={e.type === "income" ? "arrow_downward" : "arrow_upward"}
                  style={{ fontSize: 19, color: e.type === "income" ? "var(--up)" : "var(--down)" }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold truncate">{e.category}</div>
              </div>
              <div
                className="text-sm font-bold"
                style={{ color: e.type === "income" ? "var(--up)" : "var(--down)" }}
              >
                {e.type === "income" ? "+" : "-"}
                {formatMoney(e.amount)}
              </div>
              <button
                onClick={() => user && deleteCashflowEntry(user.uid, e.id)}
                className="flex-none ml-1"
                style={{ color: "var(--muted)" }}
              >
                <Icon name="close" style={{ fontSize: 18 }} />
              </button>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="เพิ่มรายการ">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <FormInput
            label="เดือน"
            type="month"
            required
            value={form.month}
            onChange={(e) => setForm({ ...form, month: e.target.value })}
          />
          <FormSelect
            label="ประเภท"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as CashflowType })}
          >
            <option value="income">รายรับ</option>
            <option value="expense">รายจ่าย</option>
          </FormSelect>
          <FormInput
            label="หมวดหมู่"
            required
            placeholder="เช่น อาหาร, เดินทาง, เงินเดือน"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />
          <FormInput
            label="จำนวนเงิน (บาท)"
            type="number"
            step="any"
            required
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
          <SubmitButton>บันทึก</SubmitButton>
        </form>
      </Modal>
    </div>
  );
}
