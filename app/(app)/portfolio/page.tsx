"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  watchHoldings,
  addHolding,
  updateHolding,
  deleteHolding,
  computePortfolioSummary,
  belongsToPortfolio,
  findSymbolPortfolioConflict,
  UNASSIGNED_PORTFOLIO_ID,
} from "@/lib/firestore";
import type { Holding, AssetClass } from "@/lib/types";
import { ASSET_CLASS_COLOR, assetClassLabel } from "@/lib/types";
import { Card, Icon } from "@/components/Card";
import { AssetIcon } from "@/components/AssetIcon";
import { UnassignedPicker } from "@/components/UnassignedPicker";
import { Modal, FormInput, FormSelect, SubmitButton } from "@/components/Modal";
import { formatPct } from "@/lib/format";
import { useCurrencyDisplay } from "@/lib/currencyDisplay";
import { useLanguage } from "@/lib/i18n";
import { usePortfolios } from "@/lib/portfolioContext";

// "cash" is intentionally not offered when adding new assets; existing cash
// holdings still render, and the select re-adds the option while editing one.
const ASSET_CLASSES: AssetClass[] = ["th_stock", "foreign_stock", "etf", "crypto"];

export default function PortfolioPage() {
  const { user } = useAuth();
  const { formatMoney } = useCurrencyDisplay();
  const { t, language } = useLanguage();
  const { portfolios, currentPortfolioId, defaultPortfolioId } = usePortfolios();
  const [allHoldings, setAllHoldings] = useState<Holding[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    symbol: "",
    assetClass: "th_stock" as AssetClass,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return watchHoldings(user.uid, setAllHoldings);
  }, [user]);

  const holdings = allHoldings.filter((h) =>
    belongsToPortfolio(h, currentPortfolioId, defaultPortfolioId)
  );
  const unassignedHoldings = allHoldings.filter((h) => h.portfolioId === UNASSIGNED_PORTFOLIO_ID);
  const summary = computePortfolioSummary(holdings);

  function openAdd() {
    setEditingId(null);
    setError(null);
    setForm({ symbol: "", assetClass: "th_stock" });
    setOpen(true);
  }

  function openEdit(h: Holding) {
    setEditingId(h.id);
    setError(null);
    setForm({ symbol: h.symbol, assetClass: h.assetClass });
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !currentPortfolioId) return;
    setError(null);
    setSubmitting(true);
    try {
      if (editingId) {
        await updateHolding(user.uid, editingId, { assetClass: form.assetClass });
      } else {
        const symbol = form.symbol.toUpperCase();
        const conflictPortfolioId = findSymbolPortfolioConflict(
          allHoldings,
          symbol,
          currentPortfolioId,
          defaultPortfolioId
        );
        if (conflictPortfolioId) {
          const name = portfolios.find((p) => p.id === conflictPortfolioId)?.name ?? t("portfolio.anotherPortfolio");
          setError(t("portfolio.symbolConflict", { symbol, portfolioName: name }));
          return;
        }
        // If this symbol already exists (e.g. it was just removed from
        // another portfolio), reassign that holding instead of creating a
        // blank duplicate — it keeps its quantity/cost basis intact.
        const existing = allHoldings.find((h) => h.symbol.toUpperCase() === symbol);
        if (existing) {
          await updateHolding(user.uid, existing.id, { portfolioId: currentPortfolioId });
        } else {
          await addHolding(user.uid, {
            symbol,
            name: symbol,
            assetClass: form.assetClass,
            quantity: 0,
            avgCost: 0,
            currentPrice: 0,
            portfolioId: currentPortfolioId,
          });
        }
      }
      setForm({ symbol: "", assetClass: "th_stock" });
      setEditingId(null);
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ animation: "scin 0.3s ease both" }}>
      <div className="flex justify-between items-start mb-4 mt-1">
        <div className="text-[26px] font-extrabold tracking-tight">{t("portfolio.title")}</div>
        <button
          onClick={openAdd}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: "var(--accent)" }}
        >
          <Icon name="add" style={{ fontSize: 22, color: "#04120c" }} />
        </button>
      </div>

      <Card>
        <div className="text-[13px]" style={{ color: "var(--muted)" }}>
          {t("portfolio.totalValue")}
        </div>
        <div className="text-2xl font-extrabold mt-1">{formatMoney(summary.totalValue)}</div>
        <div
          className="text-sm font-bold mt-0.5"
          style={{ color: summary.pnl >= 0 ? "var(--up)" : "var(--down)" }}
        >
          {formatPct(summary.pnlPct)}
        </div>
      </Card>

      <div className="flex flex-col gap-2.5 mt-3">
        {holdings.length === 0 && (
          <div className="text-sm text-center py-8" style={{ color: "var(--muted)" }}>
            {t("portfolio.empty")}
          </div>
        )}
        {holdings.map((h) => {
          const value = h.quantity * h.currentPrice;
          const pnl = value - h.quantity * h.avgCost;
          return (
            <Card key={h.id} className="!p-3.5">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-[11px] flex items-center justify-center flex-none overflow-hidden"
                  style={{ background: `${ASSET_CLASS_COLOR[h.assetClass]}22` }}
                >
                  <AssetIcon symbol={h.symbol} assetClass={h.assetClass} iconUrl={h.iconUrl} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate flex items-center gap-1.5">
                    {h.symbol}
                    {h.livePrice && (
                      <span
                        className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                        style={{ background: "var(--up)22", color: "var(--up)" }}
                      >
                        {t("portfolio.live")}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] truncate" style={{ color: "var(--muted)" }}>
                    {assetClassLabel(h.assetClass, language)} · {h.quantity} {t("portfolio.units")}
                  </div>
                </div>
                <div className="text-right flex-none">
                  <div className="text-sm font-bold">{formatMoney(value)}</div>
                  <div
                    className="text-[11px]"
                    style={{ color: pnl >= 0 ? "var(--up)" : "var(--down)" }}
                  >
                    {formatMoney(pnl)}
                  </div>
                </div>
                <button
                  onClick={() => openEdit(h)}
                  className="flex-none ml-1"
                  style={{ color: "var(--muted)" }}
                >
                  <Icon name="edit" style={{ fontSize: 18 }} />
                </button>
                <button
                  onClick={() => user && deleteHolding(user.uid, h.id)}
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
        title={editingId ? t("portfolio.editTitle") : t("portfolio.addNewTitle")}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="text-[11px] -mt-1" style={{ color: "var(--muted)" }}>
            {editingId ? t("portfolio.editHelp") : t("portfolio.addHelp")}
          </div>

          {!editingId && (
            <UnassignedPicker
              holdings={unassignedHoldings}
              onPick={(h) => {
                setForm({ symbol: h.symbol, assetClass: h.assetClass });
                setError(null);
              }}
            />
          )}

          <FormSelect
            label={t("portfolio.typeLabel")}
            value={form.assetClass}
            onChange={(e) =>
              setForm({ ...form, assetClass: e.target.value as AssetClass })
            }
          >
            {(form.assetClass === "cash" ? [...ASSET_CLASSES, "cash" as const] : ASSET_CLASSES).map(
              (c) => (
                <option key={c} value={c}>
                  {assetClassLabel(c, language)}
                </option>
              )
            )}
          </FormSelect>

          <div>
            <FormInput
              label="Ticker"
              required
              disabled={!!editingId}
              placeholder="AAPL"
              value={form.symbol}
              onChange={(e) => setForm({ ...form, symbol: e.target.value })}
            />
            {!editingId && (
              <div className="text-[11px] mt-1" style={{ color: "var(--muted)" }}>
                {t("portfolio.tickerHint")}
              </div>
            )}
          </div>

          {error && (
            <div
              className="text-xs rounded-[10px] px-3 py-2"
              style={{ background: "var(--down)22", color: "var(--down)" }}
            >
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-[14px] py-3 font-bold text-center mt-2"
              style={{ background: "var(--surface2)", color: "var(--text)" }}
            >
              {t("common.cancel")}
            </button>
            <SubmitButton disabled={submitting}>
              {submitting
                ? t("common.saving")
                : editingId
                  ? t("common.saveChanges")
                  : t("portfolio.addSubmit")}
            </SubmitButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
