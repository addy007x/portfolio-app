"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  watchDividends,
  addDividend,
  deleteDividend,
  watchHoldings,
  watchTransactions,
  quantityHeldAsOf,
} from "@/lib/firestore";
import type { Dividend, Holding, Transaction } from "@/lib/types";
import { Card, Icon } from "@/components/Card";
import { Modal, FormInput, FormSelect, SubmitButton } from "@/components/Modal";
import { formatThaiDate } from "@/lib/format";
import { useCurrencyDisplay } from "@/lib/currencyDisplay";
import { useLanguage } from "@/lib/i18n";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DividendsPage() {
  const { user } = useAuth();
  const { formatMoney } = useCurrencyDisplay();
  const { t, language } = useLanguage();
  const [allDividends, setAllDividends] = useState<Dividend[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    symbol: "",
    exDate: "",
    paymentDate: todayIso(),
    amountPerShare: "",
  });

  useEffect(() => {
    if (!user) return;
    const unsub1 = watchDividends(user.uid, setAllDividends);
    const unsub2 = watchHoldings(user.uid, setHoldings);
    const unsub3 = watchTransactions(user.uid, setTransactions);
    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, [user]);

  const heldSymbols = useMemo(
    () => Array.from(new Set(holdings.map((h) => h.symbol))).sort(),
    [holdings]
  );

  // Only already-paid dividends are shown — future/pending ones stay hidden
  // until their payment date actually arrives.
  const dividends = useMemo(
    () => allDividends.filter((d) => d.paymentDate <= todayIso()),
    [allDividends]
  );

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
  const monthKeys = [
    "dividends.monthJan",
    "dividends.monthFeb",
    "dividends.monthMar",
    "dividends.monthApr",
    "dividends.monthMay",
    "dividends.monthJun",
    "dividends.monthJul",
    "dividends.monthAug",
    "dividends.monthSep",
    "dividends.monthOct",
    "dividends.monthNov",
    "dividends.monthDec",
  ];

  const previewQuantity = form.symbol
    ? quantityHeldAsOf(transactions, form.symbol, form.exDate || form.paymentDate)
    : 0;
  const previewTotal = previewQuantity * (parseFloat(form.amountPerShare) || 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !form.symbol) return;
    const asOfDate = form.exDate || form.paymentDate;
    const quantity = quantityHeldAsOf(transactions, form.symbol, asOfDate);
    const amountPerShare = parseFloat(form.amountPerShare) || 0;
    await addDividend(user.uid, {
      symbol: form.symbol,
      exDate: form.exDate,
      paymentDate: form.paymentDate,
      amountPerShare,
      totalAmount: quantity * amountPerShare,
    });
    setForm({
      symbol: "",
      exDate: "",
      paymentDate: todayIso(),
      amountPerShare: "",
    });
    setOpen(false);
  }

  return (
    <div style={{ animation: "scin 0.3s ease both" }}>
      <div className="flex justify-between items-start mb-4 mt-1">
        <div className="text-[26px] font-extrabold tracking-tight">{t("dividends.title")}</div>
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
            {t("dividends.ytd")}
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
                  {t(monthKeys[i])}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="flex flex-col gap-2.5 mt-3">
        {dividends.length === 0 && (
          <div className="text-sm text-center py-8" style={{ color: "var(--muted)" }}>
            {t("dividends.emptyHistory")}
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
                  {formatThaiDate(d.paymentDate, language)}
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

      <Modal open={open} onClose={() => setOpen(false)} title={t("dividends.saveModalTitle")}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {heldSymbols.length === 0 ? (
            <div className="text-xs text-center py-3" style={{ color: "var(--muted)" }}>
              {t("dividends.noHoldings")}
            </div>
          ) : (
            <FormSelect
              label={t("dividends.symbolLabel")}
              required
              value={form.symbol}
              onChange={(e) => setForm({ ...form, symbol: e.target.value })}
            >
              <option value="" disabled>
                {t("dividends.symbolSelectPlaceholder")}
              </option>
              {heldSymbols.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </FormSelect>
          )}
          <div>
            <FormInput
              label={t("dividends.exDateLabel")}
              type="date"
              value={form.exDate}
              onChange={(e) => setForm({ ...form, exDate: e.target.value })}
            />
            <div className="text-[11px] mt-1" style={{ color: "var(--muted)" }}>
              {t("dividends.exDateHelp")}
            </div>
          </div>
          <FormInput
            label={t("dividends.paymentDateLabel")}
            type="date"
            required
            value={form.paymentDate}
            onChange={(e) => setForm({ ...form, paymentDate: e.target.value })}
          />
          <FormInput
            label={t("dividends.amountPerShareLabel")}
            type="number"
            step="any"
            required
            value={form.amountPerShare}
            onChange={(e) => setForm({ ...form, amountPerShare: e.target.value })}
          />
          {form.symbol && (
            <div className="text-[11px]" style={{ color: "var(--muted)" }}>
              {t("dividends.computedTotal", {
                quantity: previewQuantity,
                amount: formatMoney(previewTotal),
              })}
            </div>
          )}
          <SubmitButton disabled={heldSymbols.length === 0}>{t("dividends.save")}</SubmitButton>
        </form>
      </Modal>
    </div>
  );
}
