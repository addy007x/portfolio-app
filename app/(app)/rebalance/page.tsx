"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  watchHoldings,
  watchRebalancePlan,
  saveRebalancePlan,
  belongsToPortfolio,
} from "@/lib/firestore";
import {
  computeRebalance,
  suggestTargetsFromHoldings,
  type RebalanceMode,
  type RebalanceRow,
} from "@/lib/rebalance";
import type { Holding, RebalanceTarget } from "@/lib/types";
import { Card, Icon } from "@/components/Card";
import { AssetIcon } from "@/components/AssetIcon";
import { Modal, FormInput, SubmitButton } from "@/components/Modal";
import { useCurrencyDisplay } from "@/lib/currencyDisplay";
import { useLanguage } from "@/lib/i18n";
import { usePortfolios } from "@/lib/portfolioContext";

const MODES: RebalanceMode[] = ["dca", "sellExcess", "full"];

// Distinct hues for the allocation rings; reused for the legend so a slice
// and its label always match.
const SLICE_COLORS = [
  "#f7931a", "#4285f4", "#25e29a", "#7ed321", "#b06fe8",
  "#e8c547", "#e0393e", "#41c9e2", "#f76b8a", "#8d99ae",
];

export default function RebalancePage() {
  const { user } = useAuth();
  const { formatMoney } = useCurrencyDisplay();
  const { t } = useLanguage();
  const { currentPortfolioId, defaultPortfolioId } = usePortfolios();

  const [allHoldings, setAllHoldings] = useState<Holding[]>([]);
  // Stored with the portfolio it came from: switching portfolios must not
  // briefly show the previous one's targets, and tagging the snapshot avoids
  // resetting a loading flag from inside the effect to achieve that.
  const [loadedPlan, setLoadedPlan] = useState<{
    key: string;
    targets: RebalanceTarget[];
  } | null>(null);
  const [mode, setMode] = useState<RebalanceMode>("dca");
  const [dcaInput, setDcaInput] = useState("5000");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!user) return;
    return watchHoldings(user.uid, setAllHoldings);
  }, [user]);

  const planKey = currentPortfolioId ?? defaultPortfolioId;
  useEffect(() => {
    if (!user || !planKey) return;
    return watchRebalancePlan(user.uid, planKey, (plan) => {
      setLoadedPlan({ key: planKey, targets: plan?.targets ?? [] });
    });
  }, [user, planKey]);

  const planLoaded = loadedPlan?.key === planKey;
  const targets = planLoaded ? loadedPlan.targets : [];

  const holdings = allHoldings.filter((h) =>
    belongsToPortfolio(h, currentPortfolioId, defaultPortfolioId)
  );

  const dcaAmount = Math.max(0, parseFloat(dcaInput) || 0);
  const result = useMemo(
    () => computeRebalance(holdings, targets, mode, dcaAmount),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allHoldings, currentPortfolioId, targets, mode, dcaAmount]
  );

  const targetTotal = targets.reduce((s, t) => s + t.pct, 0);
  const hasTargets = targets.length > 0;

  return (
    <div style={{ animation: "scin 0.3s ease both" }}>
      <div className="flex justify-between items-start mb-4 mt-1">
        <div>
          <div className="text-[26px] font-extrabold tracking-tight">{t("rebalance.title")}</div>
          <div className="text-[12px] mt-0.5" style={{ color: "var(--muted)" }}>
            {t("rebalance.subtitle")}
          </div>
        </div>
        {hasTargets && (
          <button
            onClick={() => setEditing(true)}
            className="w-9 h-9 rounded-full flex items-center justify-center flex-none"
            style={{ background: "var(--surface2)" }}
          >
            <Icon name="tune" style={{ fontSize: 19, color: "var(--accent)" }} />
          </button>
        )}
      </div>

      {!planLoaded ? null : !hasTargets ? (
        <EmptyState
          onStart={() => setEditing(true)}
          canSuggest={holdings.length > 0}
          t={t}
        />
      ) : (
        <>
          {/* Headline: value + drift */}
          <div className="grid grid-cols-2 gap-2.5">
            <Card className="!p-3.5">
              <div className="text-[11px]" style={{ color: "var(--muted)" }}>
                {t("rebalance.portfolioValue")}
              </div>
              <div className="text-[19px] font-extrabold mt-0.5 truncate">
                {formatMoney(result.totalValue)}
              </div>
            </Card>
            <Card className="!p-3.5">
              <div className="text-[11px]" style={{ color: "var(--muted)" }}>
                {t("rebalance.drift")}
              </div>
              <div
                className="text-[19px] font-extrabold mt-0.5"
                style={{ color: result.maxDriftPct >= 5 ? "var(--down)" : "var(--up)" }}
              >
                {result.maxDriftPct.toFixed(1)}%
              </div>
              <div className="text-[10px]" style={{ color: "var(--muted)" }}>
                {result.maxDriftPct >= 5 ? t("rebalance.driftHigh") : t("rebalance.driftOk")}
              </div>
            </Card>
          </div>

          {targetTotal !== 100 && (
            <div
              className="text-[11px] rounded-[10px] px-3 py-2 mt-2.5"
              style={{ background: "rgba(224,57,62,0.12)", color: "var(--down)" }}
            >
              {t("rebalance.targetNot100", { total: targetTotal })}
            </div>
          )}

          {/* Allocation rings */}
          <Card className="mt-3">
            <div className="text-sm font-bold mb-3">{t("rebalance.allocationTitle")}</div>
            <div className="grid grid-cols-2 gap-3">
              <Ring
                label={t("rebalance.target")}
                slices={result.rows.map((r, i) => ({
                  pct: r.targetPct,
                  color: SLICE_COLORS[i % SLICE_COLORS.length],
                }))}
              />
              <Ring
                label={t("rebalance.current")}
                slices={result.rows.map((r, i) => ({
                  pct: r.currentPct,
                  color: SLICE_COLORS[i % SLICE_COLORS.length],
                }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-3.5">
              {result.rows.map((r, i) => (
                <div key={r.symbol} className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-none"
                    style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }}
                  />
                  <span className="text-[11px] font-semibold truncate flex-1">{r.symbol}</span>
                  <span className="text-[10.5px] flex-none" style={{ color: "var(--muted)" }}>
                    {r.targetPct}% → {r.currentPct.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/* Mode picker */}
          <Card className="mt-3">
            <div className="text-sm font-bold mb-2.5">{t("rebalance.modeTitle")}</div>
            <div className="flex flex-col gap-2">
              {MODES.map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className="flex items-start gap-2.5 rounded-[12px] px-3 py-2.5 text-left"
                  style={{
                    background: "var(--surface2)",
                    outline: mode === m ? "1.5px solid var(--accent)" : "none",
                  }}
                >
                  <Icon
                    name={mode === m ? "radio_button_checked" : "radio_button_unchecked"}
                    style={{ fontSize: 17, color: mode === m ? "var(--accent)" : "var(--muted)", marginTop: 1 }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-bold">{t(`rebalance.mode.${m}`)}</div>
                    <div className="text-[10.5px] mt-0.5" style={{ color: "var(--muted)" }}>
                      {t(`rebalance.modeHelp.${m}`)}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {mode === "dca" && (
              <div className="mt-3">
                <FormInput
                  label={t("rebalance.dcaAmount")}
                  type="number"
                  step="any"
                  value={dcaInput}
                  onChange={(e) => setDcaInput(e.target.value)}
                />
              </div>
            )}
          </Card>

          {/* Suggestions */}
          <Card className="mt-3">
            <div className="text-sm font-bold mb-2.5">{t("rebalance.suggestionTitle")}</div>

            {result.sells.length === 0 && result.buys.length === 0 ? (
              <div className="text-[12px] text-center py-5" style={{ color: "var(--muted)" }}>
                {mode === "dca" && dcaAmount <= 0
                  ? t("rebalance.enterDca")
                  : t("rebalance.nothingToDo")}
              </div>
            ) : (
              <>
                {result.sells.length > 0 && (
                  <>
                    <div className="text-[11.5px] font-bold mb-1.5" style={{ color: "var(--down)" }}>
                      {t("rebalance.sell")}
                    </div>
                    <div className="flex flex-col gap-1.5 mb-3">
                      {result.sells.map((r) => (
                        <TradeRow key={r.symbol} row={r} formatMoney={formatMoney} />
                      ))}
                    </div>
                  </>
                )}
                {result.buys.length > 0 && (
                  <>
                    <div className="text-[11.5px] font-bold mb-1.5" style={{ color: "var(--up)" }}>
                      {t("rebalance.buy")}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {result.buys.map((r) => (
                        <TradeRow key={r.symbol} row={r} formatMoney={formatMoney} />
                      ))}
                    </div>
                  </>
                )}

                <div
                  className="flex justify-between items-center mt-3 pt-2.5 text-[12px] font-bold"
                  style={{ borderTop: "1px solid var(--surface2)" }}
                >
                  <span>{t("rebalance.total")}</span>
                  <span>{formatMoney(result.totalBuy + result.totalSell)}</span>
                </div>

                {result.shortfall > 1 && (
                  <div
                    className="text-[10.5px] rounded-[10px] px-3 py-2 mt-2.5"
                    style={{ background: "var(--surface2)", color: "var(--muted)" }}
                  >
                    {t("rebalance.shortfall", { amount: formatMoney(result.shortfall) })}
                  </div>
                )}
              </>
            )}
          </Card>

          {/* Comparison table */}
          <Card className="mt-3">
            <div className="text-sm font-bold mb-2.5">{t("rebalance.compareTitle")}</div>
            <div className="flex flex-col gap-2">
              {result.rows.map((r) => (
                <CompareRow key={r.symbol} row={r} formatMoney={formatMoney} t={t} />
              ))}
            </div>
          </Card>

          <div className="flex items-start gap-1.5 mt-3 mb-1 text-[10.5px]" style={{ color: "var(--muted)" }}>
            <Icon name="info" style={{ fontSize: 13, marginTop: 1 }} />
            <span>{t("rebalance.note")}</span>
          </div>
        </>
      )}

      {/* Mounted only while open so its draft state starts fresh each time —
          a cancelled edit shouldn't carry into the next one. */}
      {editing && (
        <TargetEditor
          onClose={() => setEditing(false)}
          initial={targets}
          holdings={holdings}
          suggest={() => suggestTargetsFromHoldings(holdings)}
          onSave={async (next) => {
            if (!user || !planKey) return;
            await saveRebalancePlan(user.uid, planKey, { targets: next });
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

function EmptyState({
  onStart,
  canSuggest,
  t,
}: {
  onStart: () => void;
  canSuggest: boolean;
  t: (key: string) => string;
}) {
  return (
    <Card className="flex flex-col items-center text-center py-8">
      <Icon name="tune" style={{ fontSize: 38, color: "var(--muted)" }} />
      <div className="text-sm font-bold mt-2.5">{t("rebalance.emptyTitle")}</div>
      <div className="text-[11.5px] mt-1 px-4" style={{ color: "var(--muted)" }}>
        {canSuggest ? t("rebalance.emptyHelp") : t("rebalance.emptyNoHoldings")}
      </div>
      {canSuggest && (
        <button
          onClick={onStart}
          className="rounded-[12px] px-5 py-2.5 text-sm font-bold mt-4"
          style={{ background: "var(--accent)", color: "#04120c" }}
        >
          {t("rebalance.setTargets")}
        </button>
      )}
    </Card>
  );
}

// Conic-gradient ring: cheap to render, no chart dependency, and slices stay
// aligned with the legend because both walk the same ordered list.
function Ring({ label, slices }: { label: string; slices: Array<{ pct: number; color: string }> }) {
  const total = slices.reduce((s, x) => s + x.pct, 0);
  let cursor = 0;
  const stops: string[] = [];
  for (const s of slices) {
    if (s.pct <= 0) continue;
    const share = total > 0 ? (s.pct / total) * 100 : 0;
    stops.push(`${s.color} ${cursor}% ${cursor + share}%`);
    cursor += share;
  }
  // A portfolio with no value at all would produce an empty gradient, which
  // renders as a transparent block rather than a ring.
  const background = stops.length
    ? `conic-gradient(${stops.join(", ")})`
    : "conic-gradient(var(--surface2) 0% 100%)";

  return (
    <div className="flex flex-col items-center">
      <div className="text-[11px] mb-1.5" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      <div className="relative" style={{ width: 108, height: 108 }}>
        <div className="w-full h-full rounded-full" style={{ background }} />
        <div
          className="absolute rounded-full flex items-center justify-center"
          style={{ inset: 18, background: "var(--surface)" }}
        >
          <span className="text-[13px] font-extrabold">100%</span>
        </div>
      </div>
    </div>
  );
}

function TradeRow({
  row,
  formatMoney,
}: {
  row: RebalanceRow;
  formatMoney: (v: number) => string;
}) {
  const isBuy = row.action > 0;
  return (
    <div
      className="flex items-center gap-2.5 rounded-[11px] px-2.5 py-2"
      style={{ background: "var(--surface2)" }}
    >
      <div className="w-7 h-7 rounded-[9px] flex items-center justify-center flex-none overflow-hidden">
        <AssetIcon symbol={row.symbol} assetClass={row.assetClass} iconUrl={row.iconUrl} />
      </div>
      <span className="flex-1 text-[12.5px] font-bold truncate">{row.symbol}</span>
      <span
        className="text-[12.5px] font-bold flex-none"
        style={{ color: isBuy ? "var(--up)" : "var(--down)" }}
      >
        {isBuy ? "+" : "−"}
        {formatMoney(Math.abs(row.action))}
      </span>
    </div>
  );
}

function CompareRow({
  row,
  formatMoney,
  t,
}: {
  row: RebalanceRow;
  formatMoney: (v: number) => string;
  t: (key: string) => string;
}) {
  const over = row.driftPct > 0.05;
  const under = row.driftPct < -0.05;
  const status = over ? t("rebalance.over") : under ? t("rebalance.under") : t("rebalance.onTarget");
  const statusColor = over ? "var(--down)" : under ? "var(--up)" : "var(--muted)";

  return (
    <div className="flex items-center gap-2.5">
      <div className="w-7 h-7 rounded-[9px] flex items-center justify-center flex-none overflow-hidden">
        <AssetIcon symbol={row.symbol} assetClass={row.assetClass} iconUrl={row.iconUrl} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-bold truncate">{row.symbol}</div>
        <div className="text-[10px]" style={{ color: "var(--muted)" }}>
          {row.targetPct}% → {row.currentPct.toFixed(1)}% · {formatMoney(row.currentValue)}
        </div>
        {/* Target marker against the current bar, so "how far off" is visible
            without reading the numbers. */}
        <div className="relative h-[4px] rounded-full mt-1" style={{ background: "var(--surface2)" }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(100, row.currentPct)}%`,
              background: over ? "var(--down)" : "var(--up)",
            }}
          />
          <div
            className="absolute top-[-2px] w-[2px] h-[8px] rounded-full"
            style={{ left: `${Math.min(100, row.targetPct)}%`, background: "var(--text)" }}
          />
        </div>
      </div>
      <div className="text-right flex-none" style={{ minWidth: 52 }}>
        <div className="text-[11.5px] font-bold" style={{ color: statusColor }}>
          {row.driftPct >= 0 ? "+" : ""}
          {row.driftPct.toFixed(1)}%
        </div>
        <div className="text-[9.5px]" style={{ color: statusColor }}>
          {status}
        </div>
      </div>
    </div>
  );
}

interface DraftTarget {
  symbol: string;
  pct: string; // text while editing, so a half-typed number doesn't reset
}

function TargetEditor({
  onClose,
  initial,
  holdings,
  suggest,
  onSave,
}: {
  onClose: () => void;
  initial: RebalanceTarget[];
  holdings: Holding[];
  suggest: () => RebalanceTarget[];
  onSave: (targets: RebalanceTarget[]) => Promise<void>;
}) {
  const { t } = useLanguage();

  // Everything currently held, biggest first — the order the user sees them
  // in elsewhere.
  const heldSymbols = useMemo(() => {
    const byValue = new Map<string, number>();
    for (const h of holdings) {
      if (h.assetClass === "cash" || h.quantity <= 0) continue;
      const symbol = h.symbol.toUpperCase();
      byValue.set(symbol, (byValue.get(symbol) ?? 0) + h.quantity * h.currentPrice);
    }
    return Array.from(byValue.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([symbol]) => symbol);
  }, [holdings]);

  // Seeded once on mount (the parent only mounts this while open), so no
  // effect is needed to populate it.
  //
  // Every held asset is listed even at 0%, so the form is a complete picture
  // of the portfolio to choose from rather than only the assets that already
  // have a target — a small position rounding to 0%, or one the user removed
  // on a previous visit, would otherwise be missing with no way to add it
  // back. Symbols with a saved target that are no longer held are kept too,
  // so an intentional target for something not yet bought isn't lost.
  const [draft, setDraft] = useState<DraftTarget[]>(() => {
    const seed = new Map<string, number>();
    for (const tg of initial.length ? initial : suggest()) {
      seed.set(tg.symbol.toUpperCase(), tg.pct);
    }
    const rows = heldSymbols.map((symbol) => ({
      symbol,
      pct: String(seed.get(symbol) ?? 0),
    }));
    const heldSet = new Set(heldSymbols);
    for (const [symbol, pct] of seed) {
      if (!heldSet.has(symbol)) rows.push({ symbol, pct: String(pct) });
    }
    return rows;
  });
  const [saving, setSaving] = useState(false);

  const total = draft.reduce((s, d) => s + (parseFloat(d.pct) || 0), 0);
  const listed = new Set(draft.map((d) => d.symbol));
  const removedHeld = heldSymbols.filter((symbol) => !listed.has(symbol));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(
        draft
          .map((d) => ({ symbol: d.symbol.toUpperCase(), pct: parseFloat(d.pct) || 0 }))
          .filter((tg) => tg.pct > 0)
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={t("rebalance.editTitle")}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <div className="text-[10.5px] mb-0.5" style={{ color: "var(--muted)" }}>
          {t("rebalance.editHelp")}
        </div>
        {draft.map((d, i) => {
          const isHeld = heldSymbols.includes(d.symbol);
          const value = parseFloat(d.pct) || 0;
          return (
            <div key={`${d.symbol}-${i}`} className="flex items-center gap-2">
              <span
                className="flex-1 text-[12.5px] font-bold truncate"
                style={{ opacity: value > 0 ? 1 : 0.45 }}
              >
                {d.symbol}
                {!isHeld && (
                  <span className="text-[10px] font-normal ml-1.5" style={{ color: "var(--muted)" }}>
                    {t("rebalance.notHeld")}
                  </span>
                )}
              </span>
              <input
                type="number"
                step="any"
                min="0"
                value={d.pct}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) =>
                  setDraft((prev) =>
                    prev.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x))
                  )
                }
                className="rounded-[10px] px-2.5 py-1.5 text-sm outline-none text-right"
                style={{ background: "var(--surface2)", color: "var(--text)", width: 76 }}
              />
              <span className="text-[12px]" style={{ color: "var(--muted)" }}>
                %
              </span>
              {/* Any row can be removed. Held assets that get removed come
                  back as chips below, so dropping one is never a dead end. */}
              <button
                type="button"
                onClick={() => setDraft((prev) => prev.filter((_, j) => j !== i))}
                className="w-7 h-7 rounded-full flex items-center justify-center flex-none"
                style={{ background: "var(--surface2)" }}
                aria-label={t("rebalance.removeRow")}
              >
                <Icon name="close" style={{ fontSize: 13, color: "var(--muted)" }} />
              </button>
            </div>
          );
        })}

        {/* Held assets that were removed from the list. Without this, removing
            a row would be irreversible — there'd be no control anywhere to
            put that asset back. */}
        {removedHeld.length > 0 && (
          <div className="mt-1">
            <div className="text-[10.5px] mb-1.5" style={{ color: "var(--muted)" }}>
              {t("rebalance.addBack")}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {removedHeld.map((symbol) => (
                <button
                  key={symbol}
                  type="button"
                  onClick={() => setDraft((prev) => [...prev, { symbol, pct: "0" }])}
                  className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={{ background: "var(--surface2)", color: "var(--accent)" }}
                >
                  <Icon name="add" style={{ fontSize: 13 }} />
                  {symbol}
                </button>
              ))}
            </div>
          </div>
        )}

        <div
          className="flex justify-between items-center text-[12px] font-bold mt-1 pt-2"
          style={{ borderTop: "1px solid var(--surface2)" }}
        >
          <span>{t("rebalance.total")}</span>
          <span style={{ color: Math.abs(total - 100) < 0.01 ? "var(--up)" : "var(--down)" }}>
            {total.toFixed(1)}%
          </span>
        </div>

        {/* Fills in the percentages without changing which rows are listed,
            so nothing disappears from the form. */}
        <button
          type="button"
          onClick={() => {
            const suggested = new Map(
              suggest().map((tg) => [tg.symbol.toUpperCase(), tg.pct])
            );
            setDraft((prev) =>
              prev.map((row) => ({
                ...row,
                pct: String(suggested.get(row.symbol) ?? 0),
              }))
            );
          }}
          className="rounded-[11px] py-2 text-[11.5px] font-semibold mt-1"
          style={{ background: "var(--surface2)", color: "var(--accent)" }}
        >
          {t("rebalance.useCurrentMix")}
        </button>

        <SubmitButton disabled={saving || draft.length === 0}>
          {saving ? t("common.saving") : t("rebalance.saveTargets")}
        </SubmitButton>
      </form>
    </Modal>
  );
}
