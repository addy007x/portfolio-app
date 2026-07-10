"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  watchHoldings,
  watchTransactions,
  computePortfolioSummary,
  computeAllocation,
  belongsToPortfolio,
  getUserProfile,
  updateUserProfile,
} from "@/lib/firestore";
import { computePortfolioValueHistory } from "@/lib/valueHistory";
import { fetchPortfolioHistory, type PortfolioHistory } from "@/lib/priceFeed";
import type { Holding, Transaction } from "@/lib/types";
import { Card, Icon } from "@/components/Card";
import { Donut } from "@/components/Donut";
import { ValueChart } from "@/components/ValueChart";
import { RangeSelector } from "@/components/RangeSelector";
import { PortfolioSwitcher } from "@/components/PortfolioSwitcher";
import type { ChartRange } from "@/lib/chartRange";
import { formatPct, formatThaiDate } from "@/lib/format";
import { useCurrencyDisplay } from "@/lib/currencyDisplay";
import { useLanguage } from "@/lib/i18n";
import { usePortfolios } from "@/lib/portfolioContext";

export default function DashboardPage() {
  const { user } = useAuth();
  const { formatMoney, formatSignedMoney } = useCurrencyDisplay();
  const { t, language } = useLanguage();
  const { currentPortfolioId, defaultPortfolioId } = usePortfolios();
  const [allHoldings, setAllHoldings] = useState<Holding[]>([]);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [priceHistory, setPriceHistory] = useState<PortfolioHistory | null>(null);
  const [range, setRange] = useState<ChartRange>("1M");
  const [hideAmounts, setHideAmounts] = useState(false);

  useEffect(() => {
    if (!user) return;
    const unsub1 = watchHoldings(user.uid, setAllHoldings);
    const unsub2 = watchTransactions(user.uid, setAllTransactions);
    getUserProfile(user.uid).then((profile) => {
      if (profile?.hideDashboardAmounts) setHideAmounts(true);
    });
    return () => {
      unsub1();
      unsub2();
    };
  }, [user]);

  function toggleHideAmounts() {
    setHideAmounts((prev) => {
      const next = !prev;
      if (user) updateUserProfile(user.uid, { hideDashboardAmounts: next });
      return next;
    });
  }

  // In privacy mode every money amount renders as dots; percentages stay
  // visible since they don't reveal the portfolio's size.
  const money = (v: number) => (hideAmounts ? "฿••••••" : formatMoney(v));
  const signedMoney = (v: number) => (hideAmounts ? "฿••••••" : formatSignedMoney(v));

  const holdings = allHoldings.filter((h) =>
    belongsToPortfolio(h, currentPortfolioId, defaultPortfolioId)
  );
  const transactions = allTransactions.filter((tx) =>
    belongsToPortfolio(tx, currentPortfolioId, defaultPortfolioId)
  );
  const summary = computePortfolioSummary(holdings);
  const allocation = computeAllocation(holdings, language);

  // The chart is reconstructed from real market history (see
  // lib/valueHistory.ts) instead of stored daily snapshots, so it renders
  // immediately — no waiting for the app to be open across several days.
  const API_RANGE: Record<ChartRange, string> = {
    "24H": "1d",
    "1W": "5d",
    "1M": "1mo",
    "3M": "3mo",
    "6M": "6mo",
    "1Y": "1y",
    ALL: "5y",
  };
  const symbolsByClass = {
    stocks: Array.from(
      new Set(
        holdings
          .filter((h) => h.assetClass === "foreign_stock" || h.assetClass === "etf")
          .map((h) => h.symbol.toUpperCase())
      )
    ).sort(),
    thStocks: Array.from(
      new Set(holdings.filter((h) => h.assetClass === "th_stock").map((h) => h.symbol.toUpperCase()))
    ).sort(),
    crypto: Array.from(
      new Set(holdings.filter((h) => h.assetClass === "crypto").map((h) => h.symbol.toUpperCase()))
    ).sort(),
  };
  const historyKey = `${range}|${symbolsByClass.stocks.join(",")}|${symbolsByClass.thStocks.join(",")}|${symbolsByClass.crypto.join(",")}`;

  useEffect(() => {
    const [rangeKey, stocksKey, thKey, cryptoKey] = historyKey.split("|");
    const args = {
      stocks: stocksKey ? stocksKey.split(",") : [],
      thStocks: thKey ? thKey.split(",") : [],
      crypto: cryptoKey ? cryptoKey.split(",") : [],
      range: API_RANGE[rangeKey as ChartRange],
    };
    let cancelled = false;
    fetchPortfolioHistory(args).then((h) => {
      if (!cancelled) setPriceHistory(h);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyKey]);

  const chartPoints = useMemo(() => {
    if (!priceHistory) return [];
    const points = computePortfolioValueHistory(holdings, transactions, priceHistory);
    // Tip the curve with the live total so the chart always ends at the
    // same number shown in the headline above it.
    if (points.length > 0) {
      points.push({ id: "now", date: new Date().toISOString(), totalValue: summary.totalValue });
    }
    return points;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceHistory, allHoldings, allTransactions, currentPortfolioId, summary.totalValue]);

  return (
    <div style={{ animation: "scin 0.3s ease both" }}>
      <div className="flex justify-between items-start mb-4 mt-1">
        <div>
          <div className="text-[26px] font-extrabold tracking-tight">{t("dashboard.title")}</div>
          <div className="text-[13px] mt-0.5" style={{ color: "var(--muted)" }}>
            {formatThaiDate(new Date().toISOString(), language)}
          </div>
        </div>
        <Icon name="notifications" style={{ fontSize: 24, color: "var(--muted)" }} />
      </div>

      <div className="mb-3">
        <PortfolioSwitcher />
      </div>

      <Card>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1.5 text-[13px]" style={{ color: "var(--muted)" }}>
            <span>{t("dashboard.totalValue")}</span>
            <button
              onClick={toggleHideAmounts}
              className="flex items-center"
              style={{ color: "var(--muted)" }}
              aria-label={hideAmounts ? "show amounts" : "hide amounts"}
            >
              <Icon
                name={hideAmounts ? "visibility_off" : "visibility"}
                style={{ fontSize: 17 }}
              />
            </button>
          </div>
          <RangeSelector value={range} onChange={setRange} />
        </div>
        <div className="text-[33px] font-extrabold tracking-tight mt-2">
          {money(summary.totalValue)}
        </div>
        <div
          className="font-bold text-sm mt-0.5"
          style={{ color: summary.pnl >= 0 ? "var(--up)" : "var(--down)" }}
        >
          {signedMoney(summary.pnl)} ({formatPct(summary.pnlPct)})
        </div>
        <ValueChart points={chartPoints} formatMoney={money} emptyMessage={t("dashboard.chartEmpty")} />
      </Card>

      <div className="grid grid-cols-3 gap-2.5 mt-3">
        <Card className="!p-3">
          <div
            className="w-8 h-8 rounded-[10px] flex items-center justify-center"
            style={{ background: "rgba(37,226,154,.16)" }}
          >
            <Icon name="trending_up" style={{ fontSize: 19, color: "var(--up)" }} />
          </div>
          <div className="text-[11px] mt-2" style={{ color: "var(--muted)" }}>
            {t("dashboard.pnl")}
          </div>
          <div
            className="text-sm font-extrabold mt-0.5"
            style={{ color: summary.pnl >= 0 ? "var(--up)" : "var(--down)" }}
          >
            {signedMoney(summary.pnl)}
          </div>
          <div className="text-[10px]" style={{ color: "var(--muted)" }}>
            ({formatPct(summary.pnlPct)})
          </div>
        </Card>
        <Card className="!p-3">
          <div
            className="w-8 h-8 rounded-[10px] flex items-center justify-center"
            style={{ background: "rgba(76,141,255,.16)" }}
          >
            <Icon name="donut_small" style={{ fontSize: 19, color: "#4c8dff" }} />
          </div>
          <div className="text-[11px] mt-2" style={{ color: "var(--muted)" }}>
            {t("dashboard.returnPct")}
          </div>
          <div className="text-sm font-extrabold mt-0.5" style={{ color: "var(--up)" }}>
            {formatPct(summary.pnlPct)}
          </div>
          <div className="text-[10px]" style={{ color: "var(--muted)" }}>
            {t("dashboard.allTime")}
          </div>
        </Card>
        <Card className="!p-3">
          <div
            className="w-8 h-8 rounded-[10px] flex items-center justify-center"
            style={{ background: "rgba(155,123,255,.16)" }}
          >
            <Icon name="account_balance_wallet" style={{ fontSize: 19, color: "#9b7bff" }} />
          </div>
          <div className="text-[11px] mt-2" style={{ color: "var(--muted)" }}>
            {t("dashboard.invested")}
          </div>
          <div className="text-sm font-extrabold mt-0.5">{money(summary.totalCost)}</div>
          <div className="text-[10px]">&nbsp;</div>
        </Card>
      </div>

      <Card className="mt-3">
        <div className="text-[15px] font-bold mb-3.5">{t("dashboard.allocation")}</div>
        {allocation.length === 0 ? (
          <div className="text-sm py-4 text-center" style={{ color: "var(--muted)" }}>
            {t("dashboard.noAssets")}
          </div>
        ) : (
          <div className="flex items-center gap-3.5">
            <div className="relative flex-none" style={{ width: 130, height: 130 }}>
              <Donut slices={allocation} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-[10px]" style={{ color: "var(--muted)" }}>
                  {t("dashboard.total")}
                </div>
                <div className="text-sm font-extrabold">{money(summary.totalValue)}</div>
              </div>
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              {allocation.map((a) => (
                <div key={a.assetClass} className="flex items-center gap-2 text-xs">
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 3,
                      background: a.color,
                      flex: "none",
                    }}
                  />
                  <span className="flex-1">{a.name}</span>
                  <span style={{ color: "var(--muted)" }}>{formatPct(a.pct)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
