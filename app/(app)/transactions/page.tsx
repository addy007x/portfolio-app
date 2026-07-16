"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  watchTransactions,
  watchHoldings,
  watchEarnPositions,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  addHolding,
  updateHolding,
  computeHoldingStats,
  belongsToPortfolio,
  earnPositionValue,
  earnPositionInterestEarned,
  computeDailyInterest,
  migrateLegacyEarnPosition,
} from "@/lib/firestore";
import type { Transaction, TransactionType, Holding, AssetClass, EarnPosition } from "@/lib/types";
import { ASSET_CLASS_COLOR, assetClassLabel, transactionTypeLabel } from "@/lib/types";
import { Card, Icon } from "@/components/Card";
import { AssetIcon } from "@/components/AssetIcon";
import { Modal, FormInput, FormSelect, SubmitButton } from "@/components/Modal";
import { formatThaiDate } from "@/lib/format";
import { useCurrencyDisplay } from "@/lib/currencyDisplay";
import { useLanguage } from "@/lib/i18n";
import { CURRENCY_CODES, currencyLabel, fetchFxRateToThb, fetchCryptoPricesAndIcons } from "@/lib/priceFeed";
import { usePortfolios } from "@/lib/portfolioContext";

// "cash" is intentionally not offered when creating new holdings (matches
// the Portfolio add form); existing cash holdings still work.
const ASSET_CLASSES: AssetClass[] = ["th_stock", "foreign_stock", "etf", "crypto"];

const ALL_TRANSACTION_TYPES: TransactionType[] = ["buy", "sell", "transfer", "dividend"];

const TYPE_ICON: Record<TransactionType, string> = {
  buy: "add_circle",
  sell: "remove_circle",
  transfer: "swap_horiz",
  dividend: "paid",
};

const FILTERS: Array<"all" | TransactionType | "earn"> = ["all", "buy", "sell", "dividend", "earn"];

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
  const { formatMoney, formatSignedMoney } = useCurrencyDisplay();
  const { t: tr, language } = useLanguage();
  const { currentPortfolioId, defaultPortfolioId } = usePortfolios();
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [allHoldings, setAllHoldings] = useState<Holding[]>([]);
  const [earnPositions, setEarnPositions] = useState<EarnPosition[]>([]);
  const [earnPriceMap, setEarnPriceMap] = useState<Record<string, number>>({});
  const [earnIconMap, setEarnIconMap] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"all" | TransactionType | "earn">("all");
  const [expandedEarnId, setExpandedEarnId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [originalSymbol, setOriginalSymbol] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (!user) return;
    const unsub1 = watchTransactions(user.uid, setAllTransactions);
    const unsub2 = watchHoldings(user.uid, setAllHoldings);
    const unsub3 = watchEarnPositions(user.uid, setEarnPositions);
    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, [user]);

  const earnSymbolsKey = Array.from(new Set(earnPositions.map((p) => p.symbol))).sort().join(",");
  useEffect(() => {
    const symbols = earnSymbolsKey ? earnSymbolsKey.split(",") : [];
    if (symbols.length === 0) return;
    fetchCryptoPricesAndIcons(symbols).then(({ prices, icons }) => {
      setEarnPriceMap((prev) => ({ ...prev, ...prices }));
      setEarnIconMap((prev) => ({ ...prev, ...icons }));
    });
  }, [earnSymbolsKey]);

  // Self-heals any position saved before the coin-quantity model existed.
  useEffect(() => {
    if (!user) return;
    for (const p of earnPositions) {
      migrateLegacyEarnPosition(user.uid, p, earnPriceMap);
    }
  }, [user, earnPositions, earnPriceMap]);

  const transactions = allTransactions.filter((t) =>
    belongsToPortfolio(t, currentPortfolioId, defaultPortfolioId)
  );
  const holdings = allHoldings.filter((h) =>
    belongsToPortfolio(h, currentPortfolioId, defaultPortfolioId)
  );

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
  // A returned rate of 1 is fetchFxRateToThb's failure fallback (THB/USD is
  // ~30+), so treat anything implausibly low as "rate unavailable".
  async function fetchUsableUsdRate(): Promise<number | undefined> {
    const rate = await fetchFxRateToThb("USD");
    return rate > 1.5 ? rate : undefined;
  }

  async function recomputeHolding(
    uid: string,
    symbol: string,
    fallbackAssetClass: AssetClass,
    allTransactions: Transaction[]
  ) {
    const existing = holdings.find((h) => h.symbol === symbol);
    // Fallback rate only fills in legacy transactions that predate
    // priceUsd; newer ones carry their own locked entry-time USD price.
    const usdRate = await fetchUsableUsdRate();
    const stats = computeHoldingStats(
      allTransactions.filter((t) => t.symbol === symbol),
      usdRate
    );

    if (existing) {
      const patch: Partial<Holding> = { quantity: stats.quantity, avgCost: stats.avgCost };
      if (stats.avgCostUsd > 0) patch.avgCostUsd = stats.avgCostUsd;
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
        ...(stats.avgCostUsd > 0 ? { avgCostUsd: stats.avgCostUsd } : {}),
        currentPrice: fallbackAssetClass === "th_stock" ? stats.lastPrice : stats.avgCost,
        ...(currentPortfolioId ? { portfolioId: currentPortfolioId } : {}),
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

      // Lock in the USD price at today's rate so cost basis can display as
      // a permanently fixed USD figure later, immune to future FX moves.
      let priceUsd = 0;
      if (form.currency === "USD") {
        priceUsd = rawPrice;
      } else {
        const usdRate = await fetchUsableUsdRate();
        if (usdRate) priceUsd = price / usdRate;
      }

      const data = {
        date: form.date,
        type: form.type,
        symbol,
        quantity,
        price,
        ...(priceUsd > 0 ? { priceUsd } : {}),
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
        const newData = {
          ...data,
          ...(currentPortfolioId ? { portfolioId: currentPortfolioId } : {}),
        };
        await addTransaction(user.uid, newData);
        nextTransactions = [...transactions, { id: "__pending__", ...newData }];
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
        <div className="text-[26px] font-extrabold tracking-tight">{tr("transactions.title")}</div>
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
            {f === "all" ? tr("transactions.all") : f === "earn" ? tr("transactions.earn") : transactionTypeLabel(f, language)}
          </button>
        ))}
      </div>

      {filter === "earn" ? (
        <div className="flex flex-col gap-2.5">
          {earnPositions.length === 0 && (
            <div className="text-sm text-center py-8" style={{ color: "var(--muted)" }}>
              {tr("transactions.emptyEarn")}
            </div>
          )}
          {earnPositions.map((p) => {
            const expanded = expandedEarnId === p.id;
            const value = earnPositionValue(p, earnPriceMap);
            const gain = earnPositionInterestEarned(p, earnPriceMap);
            const daily = computeDailyInterest(p, earnPriceMap);
            return (
              <Card key={p.id} className="!p-3.5">
                <div
                  className="flex items-center gap-3"
                  onClick={() => setExpandedEarnId(expanded ? null : p.id)}
                >
                  <div
                    className="w-9 h-9 rounded-[11px] flex items-center justify-center flex-none overflow-hidden"
                    style={{ background: "var(--pal-crypto)22" }}
                  >
                    <AssetIcon symbol={p.symbol} assetClass="crypto" iconUrl={earnIconMap[p.symbol]} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate">{tr("transactions.startedEarn")} {p.symbol}</div>
                    <div className="text-[11px] truncate" style={{ color: "var(--muted)" }}>
                      {formatThaiDate(p.startDate, language)} · {p.apy}% APY · {tr("transactions.deposited")} {p.quantity} {p.symbol}
                    </div>
                  </div>
                  <div className="text-right flex-none">
                    <div className="text-sm font-bold">{formatMoney(value)}</div>
                    <div
                      className="text-[11px] font-semibold"
                      style={{ color: gain >= 0 ? "var(--up)" : "var(--down)" }}
                    >
                      {formatSignedMoney(gain)}
                    </div>
                  </div>
                  <Icon
                    name={expanded ? "expand_less" : "expand_more"}
                    style={{ fontSize: 20, color: "var(--muted)" }}
                  />
                </div>

                {expanded && (
                  <div className="mt-3.5 pt-3.5" style={{ borderTop: "var(--card-border)" }}>
                    <div className="text-xs font-bold mb-2" style={{ color: "var(--muted)" }}>
                      {tr("transactions.dailyInterestTitle", { symbol: p.symbol })}
                    </div>
                    {daily.length === 0 && (
                      <div className="text-xs text-center py-2" style={{ color: "var(--muted)" }}>
                        {tr("transactions.noInterestDays")}
                      </div>
                    )}
                    <div className="flex flex-col gap-1.5">
                      {daily.map((d) => (
                        <div key={d.date} className="flex justify-between items-baseline text-xs">
                          <span style={{ color: "var(--muted)" }}>{formatThaiDate(d.date, language)}</span>
                          <span className="text-right">
                            <span className="font-semibold" style={{ color: "var(--up)" }}>
                              +{d.coinInterest.toLocaleString("en-US", { maximumFractionDigits: 8 })}{" "}
                              {p.symbol}
                            </span>
                            <span className="ml-1" style={{ color: "var(--muted)" }}>
                              (≈{formatSignedMoney(d.thbInterest)})
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
      <div className="flex flex-col gap-2.5">
        {filtered.length === 0 && (
          <div className="text-sm text-center py-8" style={{ color: "var(--muted)" }}>
            {tr("transactions.emptyList")}
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
                    {transactionTypeLabel(t.type, language)} {t.symbol}
                  </div>
                  <div className="text-[11px] truncate" style={{ color: "var(--muted)" }}>
                    {formatThaiDate(t.date, language)} · {t.quantity} {tr("transactions.units")} @ {formatMoney(t.price)}
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
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editingId ? tr("transactions.editTitle") : tr("transactions.addTitle")}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <FormInput
            label={tr("transactions.dateLabel")}
            type="date"
            required
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
          <FormSelect
            label={tr("transactions.typeLabel")}
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as TransactionType })}
          >
            {ALL_TRANSACTION_TYPES.map((tt) => (
              <option key={tt} value={tt}>
                {transactionTypeLabel(tt, language)}
              </option>
            ))}
          </FormSelect>
          <FormInput
            label={tr("transactions.symbolLabel")}
            required
            value={form.symbol}
            onChange={(e) => setForm({ ...form, symbol: e.target.value })}
          />
          {form.type === "buy" && !holdings.find((h) => h.symbol === form.symbol.toUpperCase()) && (
            <FormSelect
              label={tr("transactions.assetClassForNew")}
              value={form.assetClass}
              onChange={(e) => setForm({ ...form, assetClass: e.target.value as AssetClass })}
            >
              {ASSET_CLASSES.map((c) => (
                <option key={c} value={c}>
                  {assetClassLabel(c, language)}
                </option>
              ))}
            </FormSelect>
          )}
          <div className="grid grid-cols-2 gap-3">
            <FormInput
              label={tr("transactions.quantityLabel")}
              type="number"
              step="any"
              required
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            />
            <FormSelect
              label={tr("transactions.currencyLabel")}
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            >
              {CURRENCY_CODES.map((c) => (
                <option key={c} value={c}>
                  {currencyLabel(c, language)}
                </option>
              ))}
            </FormSelect>
          </div>
          <FormInput
            label={tr("transactions.avgCostLabel", { currency: form.currency })}
            type="number"
            step="any"
            required
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
          />
          <FormInput
            label={tr("transactions.notesLabel")}
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
              {tr("common.cancel")}
            </button>
            <SubmitButton disabled={submitting}>
              {submitting ? tr("common.saving") : editingId ? tr("common.saveChanges") : tr("transactions.saveTransaction")}
            </SubmitButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
