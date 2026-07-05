"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  watchTransactions,
  watchHoldings,
  addTransaction,
  deleteTransaction,
  addHolding,
  updateHolding,
} from "@/lib/firestore";
import type { Transaction, TransactionType, Holding, AssetClass } from "@/lib/types";
import { ASSET_CLASS_LABEL } from "@/lib/types";
import { Card, Icon } from "@/components/Card";
import { Modal, FormInput, FormSelect, SubmitButton } from "@/components/Modal";
import { formatThaiDate } from "@/lib/format";
import { useCurrencyDisplay } from "@/lib/currencyDisplay";

const ASSET_CLASSES: AssetClass[] = [
  "th_stock",
  "foreign_stock",
  "etf",
  "crypto",
  "cash",
];

const TYPE_LABEL: Record<TransactionType, string> = {
  buy: "ซื้อ",
  sell: "ขาย",
  transfer: "โอนเงิน",
  dividend: "รับปันผล",
};

const TYPE_ICON: Record<TransactionType, string> = {
  buy: "add_circle",
  sell: "remove_circle",
  transfer: "swap_horiz",
  dividend: "paid",
};

const FILTERS: Array<"all" | TransactionType> = ["all", "buy", "sell", "transfer", "dividend"];

export default function TransactionsPage() {
  const { user } = useAuth();
  const { formatMoney } = useCurrencyDisplay();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [filter, setFilter] = useState<"all" | TransactionType>("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    type: "buy" as TransactionType,
    symbol: "",
    assetClass: "th_stock" as AssetClass,
    quantity: "",
    price: "",
    notes: "",
  });

  useEffect(() => {
    if (!user) return;
    const unsub1 = watchTransactions(user.uid, setTransactions);
    const unsub2 = watchHoldings(user.uid, setHoldings);
    return () => {
      unsub1();
      unsub2();
    };
  }, [user]);

  const filtered = useMemo(
    () => (filter === "all" ? transactions : transactions.filter((t) => t.type === filter)),
    [transactions, filter]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const symbol = form.symbol.toUpperCase();
    const quantity = parseFloat(form.quantity) || 0;
    const price = parseFloat(form.price) || 0;
    const totalValue = quantity * price;

    await addTransaction(user.uid, {
      date: form.date,
      type: form.type,
      symbol,
      quantity,
      price,
      totalValue,
      notes: form.notes,
    });

    const existing = holdings.find((h) => h.symbol === symbol);
    if (form.type === "buy") {
      if (existing) {
        const newQty = existing.quantity + quantity;
        const newAvgCost =
          newQty > 0
            ? (existing.quantity * existing.avgCost + quantity * price) / newQty
            : 0;
        await updateHolding(user.uid, existing.id, {
          quantity: newQty,
          avgCost: newAvgCost,
          currentPrice: price,
        });
      } else if (symbol) {
        await addHolding(user.uid, {
          symbol,
          name: symbol,
          assetClass: form.assetClass,
          quantity,
          avgCost: price,
          currentPrice: price,
        });
      }
    } else if (form.type === "sell" && existing) {
      await updateHolding(user.uid, existing.id, {
        quantity: Math.max(0, existing.quantity - quantity),
        currentPrice: price,
      });
    }

    setForm({
      date: new Date().toISOString().slice(0, 10),
      type: "buy",
      symbol: "",
      assetClass: "th_stock",
      quantity: "",
      price: "",
      notes: "",
    });
    setOpen(false);
  }

  return (
    <div style={{ animation: "scin 0.3s ease both" }}>
      <div className="flex justify-between items-start mb-4 mt-1">
        <div className="text-[26px] font-extrabold tracking-tight">Transaction</div>
        <button
          onClick={() => setOpen(true)}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: "var(--accent)" }}
        >
          <Icon name="add" style={{ fontSize: 22, color: "#04120c" }} />
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto mb-3 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-3 py-1.5 rounded-[10px] text-xs font-semibold flex-none"
            style={{
              background: filter === f ? "var(--accent)" : "var(--surface2)",
              color: filter === f ? "#04120c" : "var(--text)",
            }}
          >
            {f === "all" ? "ทั้งหมด" : TYPE_LABEL[f]}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2.5">
        {filtered.length === 0 && (
          <div className="text-sm text-center py-8" style={{ color: "var(--muted)" }}>
            ยังไม่มีธุรกรรม กดปุ่ม + เพื่อเพิ่มรายการแรก
          </div>
        )}
        {filtered.map((t) => (
          <Card key={t.id} className="!p-3.5">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-[11px] flex items-center justify-center flex-none"
                style={{ background: "var(--accent-soft)" }}
              >
                <Icon name={TYPE_ICON[t.type]} style={{ fontSize: 19, color: "var(--accent)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold truncate">
                  {TYPE_LABEL[t.type]} {t.symbol}
                </div>
                <div className="text-[11px] truncate" style={{ color: "var(--muted)" }}>
                  {formatThaiDate(t.date)} · {t.quantity} หน่วย @ {formatMoney(t.price)}
                </div>
              </div>
              <div className="text-sm font-bold flex-none">{formatMoney(t.totalValue)}</div>
              <button
                onClick={() => user && deleteTransaction(user.uid, t.id)}
                className="flex-none ml-1"
                style={{ color: "var(--muted)" }}
              >
                <Icon name="close" style={{ fontSize: 18 }} />
              </button>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="เพิ่มธุรกรรม">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <FormInput
            label="วันที่"
            type="date"
            required
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
          <FormSelect
            label="ประเภทธุรกรรม"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as TransactionType })}
          >
            {(Object.keys(TYPE_LABEL) as TransactionType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </FormSelect>
          <FormInput
            label="สัญลักษณ์ (Symbol)"
            required
            value={form.symbol}
            onChange={(e) => setForm({ ...form, symbol: e.target.value })}
          />
          {form.type === "buy" && !holdings.find((h) => h.symbol === form.symbol.toUpperCase()) && (
            <FormSelect
              label="ประเภทสินทรัพย์ (สำหรับสินทรัพย์ใหม่)"
              value={form.assetClass}
              onChange={(e) => setForm({ ...form, assetClass: e.target.value as AssetClass })}
            >
              {ASSET_CLASSES.map((c) => (
                <option key={c} value={c}>
                  {ASSET_CLASS_LABEL[c]}
                </option>
              ))}
            </FormSelect>
          )}
          <FormInput
            label="จำนวนหน่วย"
            type="number"
            step="any"
            required
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
          />
          <FormInput
            label="ราคา/หน่วย"
            type="number"
            step="any"
            required
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
          />
          <FormInput
            label="หมายเหตุ (ไม่บังคับ)"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          <SubmitButton>บันทึกธุรกรรม</SubmitButton>
        </form>
      </Modal>
    </div>
  );
}
