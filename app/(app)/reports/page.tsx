"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  watchHoldings,
  watchTransactions,
  watchDividends,
  watchEarnPositions,
  computePortfolioSummary,
  computeAllocation,
  computeEarnSummary,
  earnPositionQuantity,
  earnPositionValue,
  earnPositionInterestEarned,
  belongsToPortfolio,
} from "@/lib/firestore";
import type { AssetClass, Dividend, EarnPosition, Holding, Transaction } from "@/lib/types";
import { assetClassLabel, transactionTypeLabel } from "@/lib/types";
import { Card, Icon } from "@/components/Card";
import { formatPct, formatThaiDate } from "@/lib/format";
import { useCurrencyDisplay } from "@/lib/currencyDisplay";
import { useLanguage } from "@/lib/i18n";
import { usePortfolios } from "@/lib/portfolioContext";
import { fetchCryptoPricesAndIcons } from "@/lib/priceFeed";
import {
  buildReportHtml,
  openReportInNewTab,
  downloadReport,
  type ReportDoc,
  type ReportTable,
} from "@/lib/reportExport";

type Period = "month" | "year" | "all";

// Export palette: the app's asset-class hues re-stepped for a white report
// surface and validated with the dataviz six-checks script (all pass; the
// light greens' contrast WARN is relieved by direct labels + the table).
const EXPORT_CLASS_COLORS: Record<AssetClass, string> = {
  th_stock: "#18c98a",
  foreign_stock: "#4c8dff",
  etf: "#22c1c9",
  crypto: "#d97706",
  cash: "#7862d0",
};
const EXPORT_UP = "#0fa876";
const EXPORT_DOWN = "#e0393e";

function fmtQty(q: number): string {
  return q.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

export default function ReportsPage() {
  const { user } = useAuth();
  const { formatMoney, formatSignedMoney } = useCurrencyDisplay();
  const { t, language } = useLanguage();
  const { portfolios, currentPortfolioId, defaultPortfolioId } = usePortfolios();
  const [allHoldings, setAllHoldings] = useState<Holding[]>([]);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [earnPositions, setEarnPositions] = useState<EarnPosition[]>([]);
  const [earnPriceMap, setEarnPriceMap] = useState<Record<string, number>>({});
  const [period, setPeriod] = useState<Period>("year");

  useEffect(() => {
    if (!user) return;
    const unsubs = [
      watchHoldings(user.uid, setAllHoldings),
      watchTransactions(user.uid, setAllTransactions),
      watchDividends(user.uid, setDividends),
      watchEarnPositions(user.uid, setEarnPositions),
    ];
    return () => unsubs.forEach((u) => u());
  }, [user]);

  const earnSymbolsKey = Array.from(new Set(earnPositions.map((p) => p.symbol))).sort().join(",");
  useEffect(() => {
    const symbols = earnSymbolsKey ? earnSymbolsKey.split(",") : [];
    if (!symbols.length) return;
    fetchCryptoPricesAndIcons(symbols).then(({ prices }) => {
      setEarnPriceMap((prev) => ({ ...prev, ...prices }));
    });
  }, [earnSymbolsKey]);

  const holdings = allHoldings.filter((h) =>
    belongsToPortfolio(h, currentPortfolioId, defaultPortfolioId)
  );
  const portfolioTransactions = allTransactions.filter((tx) =>
    belongsToPortfolio(tx, currentPortfolioId, defaultPortfolioId)
  );

  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const datePrefix =
    period === "month" ? todayIso.slice(0, 7) : period === "year" ? todayIso.slice(0, 4) : "";
  const inPeriod = (isoDate: string) => isoDate.startsWith(datePrefix);

  const periodTransactions = portfolioTransactions.filter((tx) => inPeriod(tx.date));
  const periodDividends = dividends.filter(
    (d) => inPeriod(d.paymentDate) && d.paymentDate <= todayIso
  );

  const summary = computePortfolioSummary(holdings);
  const allocation = computeAllocation(holdings, language);
  const earnSummary = computeEarnSummary(earnPositions, earnPriceMap, now);

  const buysTotal = periodTransactions
    .filter((tx) => tx.type === "buy")
    .reduce((s, tx) => s + tx.totalValue, 0);
  const sellsTotal = periodTransactions
    .filter((tx) => tx.type === "sell")
    .reduce((s, tx) => s + tx.totalValue, 0);
  const dividendsTotal = periodDividends.reduce((s, d) => s + d.totalAmount, 0);

  const beYear = now.getFullYear() + 543;
  const periodLabel =
    period === "month"
      ? `${t("report.periodMonth")} — ${formatThaiDate(todayIso, language)}`
      : period === "year"
        ? `${t("report.periodYear")} ${beYear}`
        : t("report.periodAll");

  const portfolioName =
    portfolios.find((p) => p.id === currentPortfolioId)?.name ?? t("report.portfolio");

  const doc: ReportDoc = useMemo(() => {
    const asOf = new Date();
    const pnlColor = summary.pnl >= 0 ? EXPORT_UP : EXPORT_DOWN;
    const kpis = [
      { label: t("report.kpiValue"), value: formatMoney(summary.totalValue) },
      { label: t("report.kpiCost"), value: formatMoney(summary.totalCost) },
      {
        label: t("report.kpiPnl"),
        value: formatSignedMoney(summary.pnl),
        sub: `(${formatPct(summary.pnlPct)})`,
        color: pnlColor,
      },
      { label: t("report.kpiDividends"), value: formatMoney(dividendsTotal) },
      {
        label: t("report.kpiEarnInterest"),
        value: formatSignedMoney(earnSummary.totalInterestEarned),
        color: earnSummary.totalInterestEarned >= 0 ? EXPORT_UP : EXPORT_DOWN,
      },
    ];

    const alloc = allocation.map((a) => ({
      name: a.name,
      color: EXPORT_CLASS_COLORS[a.assetClass],
      pct: a.pct,
      valueText: formatMoney(a.value),
    }));

    const holdingsTable: ReportTable = {
      title: `${t("report.holdingsTitle")} (${holdings.length})`,
      headers: [
        t("report.colSymbol"),
        t("report.colClass"),
        t("report.colQty"),
        t("report.colCost"),
        t("report.colValue"),
        t("report.colPnl"),
        "%",
      ],
      alignRight: [2, 3, 4, 5, 6],
      emptyText: t("report.none"),
      rows: holdings.map((h) => {
        const value = h.quantity * h.currentPrice;
        const pnl = value - h.quantity * h.avgCost;
        const pnlPct = h.avgCost > 0 && h.quantity > 0 ? (pnl / (h.quantity * h.avgCost)) * 100 : 0;
        return [
          h.symbol,
          assetClassLabel(h.assetClass, language),
          fmtQty(h.quantity),
          formatMoney(h.avgCost),
          formatMoney(value),
          formatSignedMoney(pnl),
          formatPct(pnlPct),
        ];
      }),
      colors: holdings.map((h) => {
        const pnl = h.quantity * h.currentPrice - h.quantity * h.avgCost;
        const c = pnl >= 0 ? EXPORT_UP : EXPORT_DOWN;
        return [null, null, null, null, null, c, c];
      }),
    };

    const txTable: ReportTable = {
      title: `${t("report.txTitle")} (${periodTransactions.length} · ${t("report.buys")} ${formatMoney(buysTotal)} · ${t("report.sells")} ${formatMoney(sellsTotal)})`,
      headers: [
        t("report.colDate"),
        t("report.colType"),
        t("report.colSymbol"),
        t("report.colQty"),
        t("report.colPrice"),
        t("report.colTotal"),
      ],
      alignRight: [3, 4, 5],
      emptyText: t("report.none"),
      rows: periodTransactions
        .slice(0, 200)
        .map((tx) => [
          formatThaiDate(tx.date, language),
          transactionTypeLabel(tx.type, language),
          tx.symbol,
          fmtQty(tx.quantity),
          formatMoney(tx.price),
          formatMoney(tx.totalValue),
        ]),
    };

    const divTable: ReportTable = {
      title: `${t("report.divTitle")} (${periodDividends.length} · ${formatMoney(dividendsTotal)})`,
      headers: [t("report.colDate"), t("report.colSymbol"), t("report.colTotal")],
      alignRight: [2],
      emptyText: t("report.none"),
      rows: periodDividends
        .slice(0, 200)
        .map((d) => [formatThaiDate(d.paymentDate, language), d.symbol, formatMoney(d.totalAmount)]),
    };

    const earnTable: ReportTable = {
      title: `${t("report.earnTitle")} (${formatMoney(earnSummary.totalValue)})`,
      headers: [
        t("report.colSymbol"),
        "APY",
        t("report.colQty"),
        t("report.colValue"),
        t("report.colInterest"),
      ],
      alignRight: [1, 2, 3, 4],
      emptyText: t("report.none"),
      rows: earnPositions.map((p) => [
        p.symbol,
        `${p.apy}%`,
        fmtQty(earnPositionQuantity(p, asOf)),
        formatMoney(earnPositionValue(p, earnPriceMap, asOf)),
        formatSignedMoney(earnPositionInterestEarned(p, earnPriceMap, asOf)),
      ]),
      colors: earnPositions.map((p) => [
        null,
        null,
        null,
        null,
        earnPositionInterestEarned(p, earnPriceMap, asOf) >= 0 ? EXPORT_UP : EXPORT_DOWN,
      ]),
    };

    return {
      title: t("report.title"),
      portfolioName,
      periodLabel,
      generatedLabel: `${t("report.generatedAt")} ${formatThaiDate(asOf.toISOString(), language)}`,
      kpis,
      allocationTitle: t("report.allocation"),
      allocation: alloc,
      tables: [holdingsTable, txTable, divTable, earnTable],
      footer: t("report.footer"),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    holdings,
    periodTransactions,
    periodDividends,
    earnPositions,
    earnPriceMap,
    summary.totalValue,
    summary.pnl,
    language,
    periodLabel,
    portfolioName,
  ]);

  const filename = `portfolio-report-${period}-${todayIso}.html`;

  return (
    <div style={{ animation: "scin 0.3s ease both" }}>
      <div className="flex justify-between items-start mb-4 mt-1">
        <div className="text-[26px] font-extrabold tracking-tight">{t("reports.title")}</div>
      </div>

      {/* Period selector */}
      <div className="flex gap-2 mb-3">
        {(
          [
            ["month", t("report.periodMonth")],
            ["year", t("report.periodYear")],
            ["all", t("report.periodAll")],
          ] as Array<[Period, string]>
        ).map(([p, label]) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className="flex-1 py-2 rounded-[12px] text-[12.5px] font-bold"
            style={{
              background: period === p ? "var(--accent)" : "var(--surface2)",
              color: period === p ? "#04120c" : "var(--muted)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* In-app summary preview */}
      <div className="grid grid-cols-2 gap-2.5">
        <Card className="!p-3.5">
          <div className="text-[11px]" style={{ color: "var(--muted)" }}>
            {t("report.kpiValue")}
          </div>
          <div className="text-[17px] font-extrabold mt-0.5">{formatMoney(summary.totalValue)}</div>
        </Card>
        <Card className="!p-3.5">
          <div className="text-[11px]" style={{ color: "var(--muted)" }}>
            {t("report.kpiPnl")}
          </div>
          <div
            className="text-[17px] font-extrabold mt-0.5"
            style={{ color: summary.pnl >= 0 ? "var(--up)" : "var(--down)" }}
          >
            {formatSignedMoney(summary.pnl)}
          </div>
        </Card>
        <Card className="!p-3.5">
          <div className="text-[11px]" style={{ color: "var(--muted)" }}>
            {t("report.kpiDividends")}
          </div>
          <div className="text-[17px] font-extrabold mt-0.5">{formatMoney(dividendsTotal)}</div>
        </Card>
        <Card className="!p-3.5">
          <div className="text-[11px]" style={{ color: "var(--muted)" }}>
            {t("report.kpiEarnInterest")}
          </div>
          <div
            className="text-[17px] font-extrabold mt-0.5"
            style={{ color: earnSummary.totalInterestEarned >= 0 ? "var(--up)" : "var(--down)" }}
          >
            {formatSignedMoney(earnSummary.totalInterestEarned)}
          </div>
        </Card>
      </div>

      {/* Report contents overview */}
      <Card className="mt-3">
        <div className="text-[13px] font-bold mb-2">{t("report.contents")}</div>
        {[
          `${t("report.holdingsTitle")} — ${holdings.length} ${t("report.items")}`,
          `${t("report.txTitle")} — ${periodTransactions.length} ${t("report.items")}`,
          `${t("report.divTitle")} — ${periodDividends.length} ${t("report.items")}`,
          `${t("report.earnTitle")} — ${earnPositions.length} ${t("report.items")}`,
        ].map((line) => (
          <div
            key={line}
            className="flex items-center gap-2 text-[12px] py-1"
            style={{ color: "var(--muted)" }}
          >
            <Icon name="check_circle" style={{ fontSize: 14, color: "var(--accent)" }} />
            {line}
          </div>
        ))}
      </Card>

      {/* Export actions */}
      <button
        onClick={() => openReportInNewTab(buildReportHtml(doc))}
        className="w-full rounded-[14px] py-3.5 font-bold text-center mt-3 flex items-center justify-center gap-2"
        style={{ background: "var(--accent)", color: "#04120c" }}
      >
        <Icon name="print" style={{ fontSize: 19 }} />
        {t("report.exportOpen")}
      </button>
      <button
        onClick={() => downloadReport(buildReportHtml(doc), filename)}
        className="w-full rounded-[14px] py-3.5 font-bold text-center mt-2 flex items-center justify-center gap-2"
        style={{ background: "var(--surface2)", color: "var(--accent)" }}
      >
        <Icon name="download" style={{ fontSize: 19 }} />
        {t("report.exportDownload")}
      </button>
      <div className="text-[10.5px] text-center mt-2" style={{ color: "var(--muted)" }}>
        {t("report.exportHint")}
      </div>
    </div>
  );
}
