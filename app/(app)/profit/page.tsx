"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { watchHoldings, watchTransactions, belongsToPortfolio } from "@/lib/firestore";
import {
  computeRealizedStats,
  computeUnrealizedStats,
  realizedYears,
  type ProfitCategory,
  type RealizedStats,
  type UnrealizedHolding,
  type UnrealizedStats,
} from "@/lib/profit";
import type { Holding, Transaction } from "@/lib/types";
import { Card, Icon } from "@/components/Card";
import { AssetIcon } from "@/components/AssetIcon";
import { formatPct } from "@/lib/format";
import { useCurrencyDisplay } from "@/lib/currencyDisplay";
import { useLanguage } from "@/lib/i18n";
import { usePortfolios } from "@/lib/portfolioContext";

const CATEGORY_META: Record<ProfitCategory, { icon: string; color: string; labelKey: string }> = {
  stock: { icon: "trending_up", color: "var(--pal-us)", labelKey: "profit.catStock" },
  crypto: { icon: "currency_bitcoin", color: "var(--pal-crypto)", labelKey: "profit.catCrypto" },
  gold: { icon: "toll", color: "#d4a017", labelKey: "profit.catGold" },
  cash: { icon: "account_balance_wallet", color: "var(--pal-cash)", labelKey: "profit.catCash" },
};

type BarMode = "value" | "pct";

const MONTH_KEYS = [
  "month.jan", "month.feb", "month.mar", "month.apr", "month.may", "month.jun",
  "month.jul", "month.aug", "month.sep", "month.oct", "month.nov", "month.dec",
];

export default function ProfitPage() {
  const { user } = useAuth();
  const { currentPortfolioId, defaultPortfolioId } = usePortfolios();

  const [allHoldings, setAllHoldings] = useState<Holding[]>([]);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [year, setYear] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubHoldings = watchHoldings(user.uid, setAllHoldings);
    const unsubTransactions = watchTransactions(user.uid, setAllTransactions);
    return () => {
      unsubHoldings();
      unsubTransactions();
    };
  }, [user]);

  const holdings = allHoldings.filter((h) =>
    belongsToPortfolio(h, currentPortfolioId, defaultPortfolioId)
  );
  const transactions = allTransactions.filter((tx) =>
    belongsToPortfolio(tx, currentPortfolioId, defaultPortfolioId)
  );

  const years = useMemo(() => realizedYears(transactions), [transactions]);
  // Default to the most recent year that actually has sales, so the page
  // doesn't open on an empty current year in January.
  const activeYear = year ?? years[0] ?? new Date().getFullYear();

  const realized = useMemo(
    () => computeRealizedStats(transactions, activeYear),
    [transactions, activeYear]
  );
  const unrealized = useMemo(() => computeUnrealizedStats(holdings), [holdings]);

  return (
    <ProfitView
      realized={realized}
      unrealized={unrealized}
      years={years}
      activeYear={activeYear}
      onYearChange={setYear}
    />
  );
}

// Split from the data-loading above so the layout can be rendered against
// fixed sample data — the page itself is behind auth, which otherwise makes
// the visuals impossible to check without a live account.
export function ProfitView({
  realized,
  unrealized,
  years,
  activeYear,
  onYearChange,
}: {
  realized: RealizedStats;
  unrealized: UnrealizedStats;
  years: number[];
  activeYear: number;
  onYearChange: (year: number) => void;
}) {
  const { formatMoney } = useCurrencyDisplay();
  const { t } = useLanguage();
  const [showAllHoldings, setShowAllHoldings] = useState(false);
  const [barMode, setBarMode] = useState<BarMode>("value");

  const visibleHoldings = showAllHoldings
    ? unrealized.holdings
    : unrealized.holdings.slice(0, 5);
  // Value bars are relative to the biggest position, so they compare
  // holdings against each other rather than against an absolute scale.
  const maxHoldingValue = Math.max(...unrealized.holdings.map((h) => h.value), 1);

  // Bars are scaled against the largest single month in either direction, so
  // a small month stays visibly small instead of filling the axis.
  const monthlyPeak = Math.max(...realized.monthly.map((m) => Math.abs(m.pnl)), 1);

  return (
    <div style={{ animation: "scin 0.3s ease both" }}>
      <div className="text-[26px] font-extrabold tracking-tight mb-4 mt-1">{t("profit.title")}</div>

      {/* ---- Realized ---- */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icon name="check_circle" style={{ fontSize: 20, color: "var(--up)" }} />
            <span className="text-sm font-bold">{t("profit.realizedTitle")}</span>
          </div>
          {years.length > 0 && (
            <select
              value={activeYear}
              onChange={(e) => onYearChange(Number(e.target.value))}
              className="rounded-[10px] px-2.5 py-1 text-xs font-semibold outline-none"
              style={{ background: "var(--surface2)", color: "var(--text)" }}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {t("profit.year")} {y}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="text-[11.5px]" style={{ color: "var(--muted)" }}>
          {t("profit.realizedTotal")}
        </div>
        <div
          className="text-[28px] font-extrabold tracking-tight mt-0.5"
          style={{ color: realized.totalPnl >= 0 ? "var(--up)" : "var(--down)" }}
        >
          {realized.totalPnl >= 0 ? "+" : ""}
          {formatMoney(realized.totalPnl)}
        </div>
        <div
          className="text-[13px] font-bold"
          style={{ color: realized.totalPnl >= 0 ? "var(--up)" : "var(--down)" }}
        >
          ({formatPct(realized.pnlPct, 2)})
        </div>

        {realized.tradeCount === 0 ? (
          <div className="text-[12px] text-center py-6" style={{ color: "var(--muted)" }}>
            {t("profit.noSales")}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 mt-3.5">
              <Stat icon="sell" label={t("profit.tradeCount")} value={`${realized.tradeCount} ${t("profit.times")}`} />
              <Stat
                icon="bar_chart"
                label={t("profit.avgPerTrade")}
                value={formatMoney(realized.avgPnlPerTrade)}
                valueColor={realized.avgPnlPerTrade >= 0 ? "var(--up)" : "var(--down)"}
              />
              <Stat icon="target" label={t("profit.winRate")} value={`${realized.winRate.toFixed(0)}%`} />
              <Stat
                icon="balance"
                label={t("profit.profitFactor")}
                value={Number.isFinite(realized.profitFactor) ? realized.profitFactor.toFixed(2) : "∞"}
              />
            </div>

            <div className="text-[12px] font-bold mt-4 mb-2">{t("profit.monthlyTitle")}</div>
            <MonthlyChart
              monthly={realized.monthly}
              peak={monthlyPeak}
              monthLabel={(m) => t(MONTH_KEYS[m])}
            />

            <div className="grid grid-cols-2 gap-2 mt-3">
              <Stat
                icon="trending_up"
                label={t("profit.bestMonth")}
                value={realized.bestMonth ? formatMoney(realized.bestMonth.pnl) : "—"}
                sub={realized.bestMonth ? t(MONTH_KEYS[realized.bestMonth.month]) : undefined}
                valueColor="var(--up)"
              />
              <Stat
                icon="trending_down"
                label={t("profit.worstMonth")}
                value={
                  realized.worstMonth && realized.worstMonth.pnl < 0
                    ? formatMoney(realized.worstMonth.pnl)
                    : "—"
                }
                sub={
                  realized.worstMonth && realized.worstMonth.pnl < 0
                    ? t(MONTH_KEYS[realized.worstMonth.month])
                    : undefined
                }
                valueColor="var(--down)"
              />
            </div>
          </>
        )}

        <div className="flex items-start gap-1.5 mt-3 text-[10.5px]" style={{ color: "var(--muted)" }}>
          <Icon name="info" style={{ fontSize: 13, marginTop: 1 }} />
          <span>{t("profit.realizedNote")}</span>
        </div>
      </Card>

      {/* ---- Unrealized ---- */}
      <Card className="mt-3">
        <div className="flex items-center gap-2 mb-3">
          <Icon name="schedule" style={{ fontSize: 20, color: "var(--pal-crypto)" }} />
          <span className="text-sm font-bold">{t("profit.unrealizedTitle")}</span>
        </div>

        <div className="text-[11.5px]" style={{ color: "var(--muted)" }}>
          {t("profit.unrealizedTotal")}
        </div>
        <div
          className="text-[28px] font-extrabold tracking-tight mt-0.5"
          style={{ color: unrealized.totalPnl >= 0 ? "var(--up)" : "var(--down)" }}
        >
          {unrealized.totalPnl >= 0 ? "+" : ""}
          {formatMoney(unrealized.totalPnl)}
        </div>
        <div
          className="text-[13px] font-bold"
          style={{ color: unrealized.totalPnl >= 0 ? "var(--up)" : "var(--down)" }}
        >
          ({formatPct(unrealized.pnlPct, 2)})
        </div>

        {unrealized.holdings.length === 0 ? (
          <div className="text-[12px] text-center py-6" style={{ color: "var(--muted)" }}>
            {t("profit.noHoldings")}
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2 mt-3.5">
              {unrealized.categories.map((c) => {
                const meta = CATEGORY_META[c.category];
                return (
                  <div
                    key={c.category}
                    className="flex items-center gap-2.5 rounded-[12px] px-3 py-2.5"
                    style={{ background: "var(--surface2)" }}
                  >
                    <Icon name={meta.icon} style={{ fontSize: 18, color: meta.color }} />
                    <span className="flex-1 text-[12px] font-semibold">{t(meta.labelKey)}</span>
                    <div className="text-right">
                      <div
                        className="text-[13px] font-bold"
                        style={{ color: c.pnl >= 0 ? "var(--up)" : "var(--down)" }}
                      >
                        {c.pnl >= 0 ? "+" : ""}
                        {formatMoney(c.pnl)}
                      </div>
                      <div className="text-[10.5px]" style={{ color: "var(--muted)" }}>
                        {c.sharePct.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between mt-4 mb-2">
              <span className="text-[12px] font-bold">{t("profit.byHolding")}</span>
              <div className="flex rounded-[9px] overflow-hidden" style={{ background: "var(--surface2)" }}>
                {(["value", "pct"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setBarMode(mode)}
                    className="px-2.5 py-1 text-[10.5px] font-semibold"
                    style={
                      barMode === mode
                        ? { background: "var(--accent)", color: "#04120c" }
                        : { color: "var(--muted)" }
                    }
                  >
                    {mode === "value" ? t("profit.barValue") : t("profit.barPct")}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {visibleHoldings.map((h) => (
                <HoldingRow
                  key={h.id}
                  holding={h}
                  formatMoney={formatMoney}
                  barMode={barMode}
                  maxValue={maxHoldingValue}
                />
              ))}
            </div>

            {unrealized.holdings.length > 5 && (
              <button
                onClick={() => setShowAllHoldings((v) => !v)}
                className="w-full mt-2.5 rounded-[10px] py-2 text-[11.5px] font-semibold"
                style={{ background: "var(--surface2)", color: "var(--accent)" }}
              >
                {showAllHoldings
                  ? t("profit.showLess")
                  : t("profit.showAll", { count: unrealized.holdings.length })}
              </button>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
  valueColor,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
}) {
  return (
    <div className="rounded-[12px] px-3 py-2.5" style={{ background: "var(--surface2)" }}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon name={icon} style={{ fontSize: 14, color: "var(--muted)" }} />
        <span className="text-[10.5px] leading-tight" style={{ color: "var(--muted)" }}>
          {label}
        </span>
      </div>
      <div className="text-[14px] font-bold" style={{ color: valueColor }}>
        {value}
      </div>
      {sub && (
        <div className="text-[10px]" style={{ color: "var(--muted)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// Zero-line bar chart: gains above, losses below, so a losing month reads as
// a loss at a glance rather than just a shorter bar.
function MonthlyChart({
  monthly,
  peak,
  monthLabel,
}: {
  monthly: Array<{ month: number; pnl: number }>;
  peak: number;
  monthLabel: (month: number) => string;
}) {
  const HALF = 52; // px available on each side of the zero line
  return (
    <div className="overflow-x-auto">
      <div className="flex items-end gap-[3px]" style={{ minWidth: 300 }}>
        {monthly.map((m) => {
          const height = Math.max(2, (Math.abs(m.pnl) / peak) * HALF);
          const positive = m.pnl >= 0;
          return (
            <div key={m.month} className="flex-1 flex flex-col items-center" style={{ minWidth: 20 }}>
              <div className="flex flex-col justify-end" style={{ height: HALF }}>
                {positive && m.pnl !== 0 && (
                  <div
                    className="rounded-t-[3px] w-full"
                    style={{ height, background: "var(--up)", minWidth: 12 }}
                  />
                )}
              </div>
              <div className="w-full" style={{ height: 1, background: "var(--border, #ffffff22)" }} />
              <div className="flex flex-col justify-start" style={{ height: HALF }}>
                {!positive && (
                  <div
                    className="rounded-b-[3px] w-full"
                    style={{ height, background: "var(--down)", minWidth: 12 }}
                  />
                )}
              </div>
              <div className="text-[8.5px] mt-1" style={{ color: "var(--muted)" }}>
                {monthLabel(m.month)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HoldingRow({
  holding,
  formatMoney,
  barMode,
  maxValue,
}: {
  holding: UnrealizedHolding;
  formatMoney: (v: number) => string;
  barMode: BarMode;
  maxValue: number;
}) {
  const up = holding.pnl >= 0;
  // In "value" mode the bar is the position's size relative to the largest
  // one; in "pct" mode it's the return, capped so an outlier gain doesn't
  // blow out the row.
  const width =
    barMode === "value"
      ? (holding.value / maxValue) * 100
      : Math.min(100, Math.abs(holding.pnlPct));
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-none overflow-hidden"
        style={{ background: "var(--surface2)" }}
      >
        <AssetIcon
          symbol={holding.symbol}
          assetClass={holding.assetClass}
          iconUrl={holding.iconUrl}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-bold truncate">{holding.symbol}</div>
        <div className="text-[10px] truncate" style={{ color: "var(--muted)" }}>
          {formatMoney(holding.value)} · {formatMoney(holding.cost)}
        </div>
        <div className="h-[3px] rounded-full mt-1" style={{ background: "var(--surface2)" }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${width}%`, background: up ? "var(--up)" : "var(--down)" }}
          />
        </div>
      </div>
      <div className="text-right flex-none">
        <div className="text-[12.5px] font-bold" style={{ color: up ? "var(--up)" : "var(--down)" }}>
          {up ? "+" : ""}
          {formatMoney(holding.pnl)}
        </div>
        <div className="text-[10.5px] font-semibold" style={{ color: up ? "var(--up)" : "var(--down)" }}>
          {formatPct(holding.pnlPct, 2)}
        </div>
      </div>
    </div>
  );
}
