"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  watchEarnPositions,
  addEarnPosition,
  updateEarnPosition,
  deleteEarnPosition,
  computeEarnSummary,
  groupEarnPositionsBySymbol,
  migrateLegacyEarnPosition,
} from "@/lib/firestore";
import type { EarnPosition } from "@/lib/types";
import { Card, Icon } from "@/components/Card";
import { AssetIcon } from "@/components/AssetIcon";
import { ValueChart } from "@/components/ValueChart";
import { Modal, FormInput, SubmitButton } from "@/components/Modal";
import { formatPct } from "@/lib/format";
import { useCurrencyDisplay } from "@/lib/currencyDisplay";
import { useLanguage } from "@/lib/i18n";
import { fetchCryptoPricesAndIcons } from "@/lib/priceFeed";
import { RangeSelector } from "@/components/RangeSelector";
import { rangeStartDate, type ChartRange } from "@/lib/chartRange";

function formatCoinQty(qty: number): string {
  return qty.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

export default function EarnPage() {
  const { user } = useAuth();
  const { formatMoney, formatSignedMoney } = useCurrencyDisplay();
  const { t } = useLanguage();
  const [positions, setPositions] = useState<EarnPosition[]>([]);
  const [iconMap, setIconMap] = useState<Record<string, string>>({});
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});
  const [now, setNow] = useState(() => new Date());
  const [range, setRange] = useState<ChartRange>("24H");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    symbol: "",
    apy: "",
    quantity: "",
    startDate: new Date().toISOString().slice(0, 10),
  });
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const [editing, setEditing] = useState<EarnPosition | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editForm, setEditForm] = useState({
    apy: "",
    quantity: "",
    costBasisPrice: "",
    startDate: "",
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
    fetchCryptoPricesAndIcons(symbols).then(({ prices, icons }) => {
      setPriceMap((prev) => ({ ...prev, ...prices }));
      setIconMap((prev) => ({ ...prev, ...icons }));
    });
  }, [symbolsKey]);

  // Self-heals any position saved before the coin-quantity model existed.
  useEffect(() => {
    if (!user) return;
    for (const p of positions) {
      migrateLegacyEarnPosition(user.uid, p, priceMap);
    }
  }, [user, positions, priceMap]);

  const summary = computeEarnSummary(positions, priceMap, now, rangeStartDate(range, now));
  const groups = groupEarnPositionsBySymbol(positions, priceMap, now);

  async function handleDeleteGroup(positionIds: string[]) {
    if (!user) return;
    await Promise.all(positionIds.map((id) => deleteEarnPosition(user.uid, id)));
  }

  function openEdit(p: EarnPosition) {
    setEditing(p);
    setEditForm({
      apy: String(p.apy),
      quantity: String(p.quantity),
      costBasisPrice: String(p.costBasisPrice),
      startDate: p.startDate,
    });
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !editing) return;
    setEditSubmitting(true);
    try {
      await updateEarnPosition(user.uid, editing.id, {
        apy: parseFloat(editForm.apy) || 0,
        quantity: parseFloat(editForm.quantity) || 0,
        costBasisPrice: parseFloat(editForm.costBasisPrice) || 0,
        startDate: editForm.startDate,
      });
      setEditing(null);
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setFormError(null);
    setSubmitting(true);
    try {
      const symbol = form.symbol.toUpperCase();
      const quantity = parseFloat(form.quantity) || 0;
      let price = priceMap[symbol];
      if (!price) {
        const fetched = await fetchCryptoPricesAndIcons([symbol]);
        price = fetched.prices[symbol];
        if (fetched.icons[symbol]) setIconMap((prev) => ({ ...prev, [symbol]: fetched.icons[symbol] }));
      }
      if (!price) {
        setFormError(t("earn.priceNotFound", { symbol }));
        return;
      }
      setPriceMap((prev) => ({ ...prev, [symbol]: price }));
      await addEarnPosition(user.uid, {
        symbol,
        apy: parseFloat(form.apy) || 0,
        quantity,
        costBasisPrice: price,
        startDate: form.startDate,
      });
      setForm({
        symbol: "",
        apy: "",
        quantity: "",
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
        <div className="text-[26px] font-extrabold tracking-tight">{t("earn.title")}</div>
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
            {t("earn.totalValue")}
          </div>
          <RangeSelector value={range} onChange={setRange} />
        </div>
        <div className="text-[31px] font-extrabold tracking-tight mt-1.5">
          {formatMoney(summary.totalValue)}
        </div>
        <div className="font-bold text-sm mt-0.5" style={{ color: summary.totalGain >= 0 ? "var(--up)" : "var(--down)" }}>
          {formatSignedMoney(summary.totalGain)} ({formatPct(summary.totalGainPct)})
        </div>
        <ValueChart
          points={summary.history}
          formatMoney={formatMoney}
          emptyMessage={t("earn.empty")}
        />
      </Card>

      <div className="text-sm font-semibold mt-4 mb-2.5" style={{ color: "var(--muted)" }}>
        {t("earn.listTitle")}
      </div>

      <div className="flex flex-col gap-2.5">
        {positions.length === 0 && (
          <div className="text-sm text-center py-8" style={{ color: "var(--muted)" }}>
            {t("earn.listEmpty")}
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
                  <div className="text-sm font-bold truncate">
                    {formatCoinQty(g.totalQuantity)} {g.symbol}
                  </div>
                  <div className="text-[11px] truncate" style={{ color: "var(--muted)" }}>
                    Flexible {g.apy}% APY
                    {g.positionIds.length > 1 &&
                      ` · ${t("earn.combined")} ${g.positionIds.length} ${t("earn.entries")}`}
                  </div>
                </div>
                <div className="text-right flex-none">
                  <div className="text-sm font-bold">{formatMoney(g.totalValue)}</div>
                  <div
                    className="text-[11px] font-semibold"
                    style={{ color: gain >= 0 ? "var(--up)" : "var(--down)" }}
                  >
                    {formatSignedMoney(gain)}
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (g.positionIds.length === 1) {
                      const p = positions.find((x) => x.id === g.positionIds[0]);
                      if (p) openEdit(p);
                    } else {
                      setExpandedSymbol((prev) => (prev === g.symbol ? null : g.symbol));
                    }
                  }}
                  className="flex-none ml-1"
                  style={{ color: "var(--muted)" }}
                >
                  <Icon name="edit" style={{ fontSize: 18 }} />
                </button>
                <button
                  onClick={() => handleDeleteGroup(g.positionIds)}
                  className="flex-none ml-1"
                  style={{ color: "var(--muted)" }}
                >
                  <Icon name="close" style={{ fontSize: 18 }} />
                </button>
              </div>

              {expandedSymbol === g.symbol && g.positionIds.length > 1 && (
                <div
                  className="flex flex-col gap-2 mt-3 pt-3"
                  style={{ borderTop: "var(--card-border)" }}
                >
                  {positions
                    .filter((p) => p.symbol === g.symbol)
                    .map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-2 text-[12px]">
                        <div className="min-w-0 truncate" style={{ color: "var(--muted)" }}>
                          {formatCoinQty(p.quantity)} {p.symbol} · {p.apy}% APY · {t("earn.startedOn")} {p.startDate}
                        </div>
                        <div className="flex items-center gap-2 flex-none">
                          <button onClick={() => openEdit(p)} style={{ color: "var(--muted)" }}>
                            <Icon name="edit" style={{ fontSize: 16 }} />
                          </button>
                          <button
                            onClick={() => handleDeleteGroup([p.id])}
                            style={{ color: "var(--muted)" }}
                          >
                            <Icon name="close" style={{ fontSize: 16 }} />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={t("earn.addTitle")}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <FormInput
            label={t("earn.symbol")}
            required
            value={form.symbol}
            onChange={(e) => setForm({ ...form, symbol: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <FormInput
              label={t("earn.apy")}
              type="number"
              step="any"
              required
              value={form.apy}
              onChange={(e) => setForm({ ...form, apy: e.target.value })}
            />
            <FormInput
              label={`${t("earn.quantity")}${form.symbol ? ` (${form.symbol.toUpperCase()})` : ""}`}
              type="number"
              step="any"
              required
              placeholder="0.01"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            />
          </div>
          <FormInput
            label={t("earn.startDate")}
            type="date"
            required
            value={form.startDate}
            onChange={(e) => setForm({ ...form, startDate: e.target.value })}
          />
          {formError && (
            <div
              className="text-xs rounded-[10px] px-3 py-2"
              style={{ background: "var(--down)22", color: "var(--down)" }}
            >
              {formError}
            </div>
          )}
          <div className="text-[11px]" style={{ color: "var(--muted)" }}>
            {t("earn.addHelp")}
          </div>
          <SubmitButton disabled={submitting}>
            {submitting ? t("common.saving") : t("earn.addSubmit")}
          </SubmitButton>
        </form>
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`${t("earn.editTitle")} ${editing?.symbol ?? ""}`}>
        <form onSubmit={handleEditSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <FormInput
              label={t("earn.apy")}
              type="number"
              step="any"
              required
              value={editForm.apy}
              onChange={(e) => setEditForm({ ...editForm, apy: e.target.value })}
            />
            <FormInput
              label={`${t("earn.startingQuantity")}${editing ? ` (${editing.symbol})` : ""}`}
              type="number"
              step="any"
              required
              value={editForm.quantity}
              onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormInput
              label={t("earn.costBasisPrice")}
              type="number"
              step="any"
              required
              value={editForm.costBasisPrice}
              onChange={(e) => setEditForm({ ...editForm, costBasisPrice: e.target.value })}
            />
            <FormInput
              label={t("earn.startDate")}
              type="date"
              required
              value={editForm.startDate}
              onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
            />
          </div>
          <div className="text-[11px]" style={{ color: "var(--muted)" }}>
            {t("earn.editHelp")}
          </div>
          <SubmitButton disabled={editSubmitting}>
            {editSubmitting ? t("common.saving") : t("earn.editSubmit")}
          </SubmitButton>
        </form>
      </Modal>
    </div>
  );
}
