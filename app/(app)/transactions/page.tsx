"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  watchTransactions,
  watchHoldings,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  addHolding,
  updateHolding,
  computeHoldingStats,
} from "@/lib/firestore";
import type { Transaction, TransactionType, Holding, AssetClass } from "@/lib/types";
import { ASSET_CLASS_LABEL, ASSET_CLASS_COLOR } from "@/lib/types";
import { Card, Icon } from "@/components/Card";
import { AssetIcon } from "@/components/AssetIcon";
import { Modal, FormInput, FormSelect, SubmitButton } from "@/components/Modal";
import { formatThaiDate } from "@/lib/format";
import { useCurrencyDisplay } from "@/lib/currencyDisplay";
import { CURRENCY_CODES, CURRENCY_LABEL, fetchFxRateToThb } from "@/lib/priceFeed";

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

const EMPTY_FORM = {
  date: new Date().toISOString().slice(0, 10),
  type: "buy" as TransactionType,
  symbol: "",
  assetClass: "th_stock" as AssetClass,
  currency: "THB",
  quantity: "",
  price: "",
  notes: "",
};

export default function TransactionsPage() {
  const { user } = useAuth();
  const { formatMoney } = useCurrencyDisplay();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [filter, setFilter] = useState<"all" | TransactionType>("all");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [originalSymbol, setOriginalSymbol] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

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

  function openAdd() {
    setEditingId(null);
    setOriginalSymbol(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  }

  function openEdit(t: Transaction) {
    setEditingId(t.id);
    setOriginalSymbol(t.symbol);
    setForm({
      date: t.date,
      type: t.type,
      symbol: t.symbol,
      assetClass: holdings.find((h) => h.symbol === t.symbol)?.assetClass ?? "th_stock",
      currency: "THB",
      quantity: String(t.quantity),
      price: String(t.price),
      notes: t.notes ?? "",
    });
    setOpen(true);
  }

  // Recomputes a symbol's holding from the given (already up-to-date)
  // transaction list, so edits/deletes never leave quantity/avgCost stale.
  async function recomputeHolding(
    uid: string,
    symbol: string,
    fallbackAssetClass: AssetClass,
    allTransactions: Transaction[]
  ) {
    const existing = holdings.find((h) => h.symbol === symbol);
    const stats = computeHoldingStats(allTransactions.filter((t) => t.symbol === symbol));

    if (existing) {
      const patch: Partial<Holding> = { quantity: stats.quantity, avgCost: stats.avgCost };
      if (existing.assetClass === "th_stock") {
        if (stats.lastPrice > 0) patch.currentPrice = stats.lastPrice;
      } else if (!existing.currentPrice) {
        patch.currentPrice = stats.avgCost;
      }
      await updateHolding(uid, existing.id, patch);
    } else if (symbol && stats.quantity !== 0) {
      await addHolding(uid, {
        symbol,
        name: symbol,
        assetClass: fallbackAssetClass,
        quantity: stats.quantity,
        avgCost: stats.avgCost,
        currentPrice: fallbackAssetClass === "th_stock" ? stats.lastPrice : stats.avgCost,
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    try {
      const symbol = form.symbol.toUpperCase();
      const quantity = parseFloat(form.quantity) || 0;
      const rawPrice = parseFloat(form.price) || 0;
      const rate = await fetchFxRateToThb(form.currency);
      const price = rawPrice * rate;
      const totalValue = quantity * price;

      const data = {
        date: form.date,
        type: form.type,
        symbol,
        quantity,
        price,
        totalValue,
        notes: form.notes,
      };

      let nextTransactions: Transaction[];
      if (editingId) {
        await updateTransaction(user.uid, editingId, data);
        nextTransactions = transactions.map((t) =>
          t.id === editingId ? { ...t, ...data } : t
        );
      } else {
        await addTransaction(user.uid, data);
        nextTransactions = [...transactions, { id: "__pending__", ...data }];
      }

      await recomputeHolding(user.uid, symbol, form.assetClass, nextTransactions);
      if (originalSymbol && originalSymbol !== symbol) {
        await recomputeHolding(user.uid, originalSymbol, form.assetClass, nextTransactions);
      }

      setForm(EMPTY_FORM);
      setEditingId(null);
      setOriginalSymbol(null);
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(t: Transaction) {
    if (!user) return;
    await deleteTransaction(user.uid, t.id);
    const nextTransactions = transactions.filter((x) => x.id !== t.id);
    await recomputeHolding(user.uid, t.symbol, "th_stock", nextTransactions);
  }

  return (
    <div style={{ animation: "scin 0.3s ease both" }}>
      <div className="flex justify-between items-start mb-4 mt-1">
        <div className="text-[26px] font-extrabold tracking-tight">Transaction</div>
        <button
          onClick={openAdd}
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
        {filtered.map((t) => {
          const holding = holdings.find((h) => h.symbol === t.symbol);
          return (
            <Card key={t.id} className="!p-3.5">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-[11px] flex items-center justify-center flex-none overflow-hidden"
                  style={{
                    background: holding
                      ? `${ASSET_CLASS_COLOR[holding.assetClass]}22`
                      : "var(--accent-soft)",
                  }}
                >
                  {holding ? (
                    <AssetIcon symbol={holding.symbol} assetClass={holding.assetClass} iconUrl={holding.iconUrl} />
                  ) : (
                    <Icon name={TYPE_ICON[t.type]} style={{ fontSize: 19, color: "var(--accent)" }} />
                  )}
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
                  onClick={() => openEdit(t)}
                  className="flex-none ml-1"
                  style={{ color: "var(--muted)" }}
                >
                  <Icon name="edit" style={{ fontSize: 18 }} />
                </button>
                <button
                  onClick={() => handleDelete(t)}
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

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editingId ? "แก้ไขธุรกรรม" : "เพิ่มธุรกรรม"}
      >
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
          <div className="grid grid-cols-2 gap-3">
            <FormInput
              label="จำนวนหน่วย"
              type="number"
              step="any"
              required
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            />
            <FormSelect
              label="สกุลเงิน"
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            >
              {CURRENCY_CODES.map((c) => (
                <option key={c} value={c}>
                  {CURRENCY_LABEL[c]}
                </option>
              ))}
            </FormSelect>
          </div>
          <FormInput
            label={`ต้นทุนเฉลี่ย (${form.currency})`}
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
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-[14px] py-3 font-bold text-center mt-2"
              style={{ background: "var(--surface2)", color: "var(--text)" }}
            >
              ยกเลิก
            </button>
            <SubmitButton disabled={submitting}>
              {submitting ? "กำลังบันทึก..." : editingId ? "บันทึกการแก้ไข" : "บันทึกธุรกรรม"}
            </SubmitButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
