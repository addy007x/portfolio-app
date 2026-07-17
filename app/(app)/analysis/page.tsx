"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  watchHoldings,
  watchPriceAlerts,
  addPriceAlert,
  deletePriceAlert,
  getUserProfile,
} from "@/lib/firestore";
import type { Holding, PriceAlert } from "@/lib/types";
import { Card, Icon } from "@/components/Card";
import { AssetIcon } from "@/components/AssetIcon";
import { AnalysisChart, type LevelLine } from "@/components/AnalysisChart";
import { FormInput, FormSelect } from "@/components/Modal";
import { useLanguage } from "@/lib/i18n";
import { fetchCandles, type AnalysisSource, type OhlcCandle } from "@/lib/priceFeed";
import {
  emaSeries,
  rsiSeries,
  macdSeries,
  pivotPoints,
  fibRetracement,
  supportResistance,
  trendLine,
  breakState,
  summarize,
  closeOf,
  type Candle,
} from "@/lib/technical";
import Link from "next/link";

const TIMEFRAMES = ["15m", "1h", "4h", "1d", "1w"] as const;
type Tf = (typeof TIMEFRAMES)[number];
const TF_LABEL: Record<Tf, string> = { "15m": "15m", "1h": "1H", "4h": "4H", "1d": "1D", "1w": "1W" };

const EMA_PERIODS = [
  { period: 20, color: "#25e29a" },
  { period: 50, color: "#4c8dff" },
  { period: 100, color: "#ff9f43" },
  { period: 200, color: "#ff6b81" },
];

function sourceOf(h: Holding): AnalysisSource | null {
  if (h.assetClass === "crypto") return "crypto";
  if (h.assetClass === "th_stock") return "th";
  if (h.assetClass === "foreign_stock" || h.assetClass === "etf") return "us";
  return null;
}

function quoteUnit(source: AnalysisSource): string {
  return source === "crypto" ? "USDT" : source === "us" ? "USD" : "THB";
}

function fmtPrice(v: number): string {
  const abs = Math.abs(v);
  const digits = abs >= 1000 ? 0 : abs >= 1 ? 2 : 4;
  return v.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export default function AnalysisPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [lineConfigured, setLineConfigured] = useState<boolean | null>(null);

  const [picked, setPicked] = useState(""); // "" = not chosen yet, "__custom__" = free text
  const [customSymbol, setCustomSymbol] = useState("");
  const [customSource, setCustomSource] = useState<AnalysisSource>("crypto");
  const [tf, setTf] = useState<Tf>("1d");
  const [candlesByTf, setCandlesByTf] = useState<Record<string, OhlcCandle[]>>({});
  const [loadedKey, setLoadedKey] = useState("");

  useEffect(() => {
    if (!user) return;
    const unsub1 = watchHoldings(user.uid, setHoldings);
    const unsub2 = watchPriceAlerts(user.uid, setAlerts);
    getUserProfile(user.uid).then((p) => setLineConfigured(!!(p?.lineToken && p?.lineUserId)));
    return () => {
      unsub1();
      unsub2();
    };
  }, [user]);

  const analyzable = holdings.filter((h) => sourceOf(h) !== null);

  // Resolve the active symbol/source: explicit pick > custom > first holding.
  const firstHolding = analyzable[0];
  let symbol = "";
  let source: AnalysisSource = "crypto";
  if (picked === "__custom__") {
    symbol = customSymbol.trim().toUpperCase();
    source = customSource;
  } else if (picked) {
    const h = analyzable.find((x) => x.symbol.toUpperCase() === picked);
    if (h) {
      symbol = picked;
      source = sourceOf(h) ?? "crypto";
    }
  } else if (firstHolding) {
    symbol = firstHolding.symbol.toUpperCase();
    source = sourceOf(firstHolding) ?? "crypto";
  }

  const symbolKey = symbol ? `${source}:${symbol}` : "";

  // Bumped by the retry button below to force a re-fetch of the same
  // symbol — a plain data provider hiccup (rate limit, timeout) shouldn't
  // require switching symbols/timeframes just to try again.
  const [retryTick, setRetryTick] = useState(0);

  // Fetch every timeframe for the active symbol (the multi-TF summary needs
  // them all anyway; the server caches candles for 2 minutes).
  useEffect(() => {
    if (!symbolKey) return;
    const [src, sym] = symbolKey.split(":");
    let cancelled = false;
    Promise.all(
      TIMEFRAMES.map((frame) =>
        fetchCandles(sym, src as AnalysisSource, frame).then((c) => [frame, c] as const)
      )
    ).then((results) => {
      if (cancelled) return;
      const next: Record<string, OhlcCandle[]> = {};
      for (const [frame, c] of results) next[frame] = c;
      setCandlesByTf(next);
      setLoadedKey(symbolKey);
    });
    return () => {
      cancelled = true;
    };
  }, [symbolKey, retryTick]);

  const loaded = loadedKey === symbolKey;
  const candles: Candle[] = useMemo(
    () => (loaded ? candlesByTf[tf] ?? [] : []),
    [loaded, candlesByTf, tf]
  );

  const analysis = useMemo(() => {
    if (candles.length < 30) return null;
    const closes = candles.map(closeOf);
    const emas = EMA_PERIODS.map((e) => ({
      ...e,
      series: emaSeries(closes, e.period),
    }));
    const rsi = rsiSeries(closes);
    const macd = macdSeries(closes);
    // Standard practice: daily pivots for intraday timeframes, weekly
    // pivots on the weekly chart — always from the last COMPLETED candle.
    const pivotTf = tf === "1w" ? "1w" : "1d";
    const pivotCandles = candlesByTf[pivotTf] ?? candles;
    const pivots =
      pivotCandles.length >= 2 ? pivotPoints(pivotCandles[pivotCandles.length - 2]) : null;
    const fib = fibRetracement(candles.slice(-120));
    const sr = supportResistance(candles.slice(-120));
    const trend = trendLine(closes.slice(-90));
    const brk = breakState(candles);
    const lastClose = closes[closes.length - 1];
    return { closes, emas, rsi, macd, pivots, fib, sr, trend, brk, lastClose };
  }, [candles, candlesByTf, tf]);

  const mtf = useMemo(() => {
    if (!loaded) return [];
    return TIMEFRAMES.map((frame) => ({
      frame,
      summary: summarize((candlesByTf[frame] ?? []) as Candle[]),
    }));
  }, [loaded, candlesByTf]);

  const unit = quoteUnit(source);

  const [showEma, setShowEma] = useState(true);
  const [showPivot, setShowPivot] = useState(true);
  const [showFib, setShowFib] = useState(false);
  const [showSr, setShowSr] = useState(true);
  const [showTrend, setShowTrend] = useState(true);

  const chartLevels: LevelLine[] = useMemo(() => {
    if (!analysis) return [];
    const out: LevelLine[] = [];
    if (showSr) {
      analysis.sr.resistances.forEach((lv, i) =>
        out.push({ price: lv, color: "var(--down)", label: `R${i + 1}` })
      );
      analysis.sr.supports.forEach((lv, i) =>
        out.push({ price: lv, color: "var(--up)", label: `S${i + 1}` })
      );
    }
    if (showPivot && analysis.pivots) {
      out.push({ price: analysis.pivots.pp, color: "#9b7bff", label: "P" });
    }
    if (showFib && analysis.fib) {
      analysis.fib.levels.forEach((f) =>
        out.push({ price: f.price, color: "#b088ff", label: f.ratio.toString().replace("0.", ".") })
      );
    }
    return out;
  }, [analysis, showSr, showPivot, showFib]);

  async function createAlert(level: number, label: string) {
    if (!user || !symbol || !analysis) return;
    const direction = level >= analysis.lastClose ? "above" : "below";
    await addPriceAlert(user.uid, buildAlert(symbol, source, level, direction, label));
  }

  async function createBreakAlerts() {
    if (!analysis || analysis.brk?.state !== "inRange") return;
    const { resistance, support } = analysis.brk;
    if (resistance !== null) await createAlert(resistance, `Breakout ${t("analysis.resistance")}`);
    if (support !== null) await createAlert(support, `Breakdown ${t("analysis.support")}`);
  }

  const activeHolding = analyzable.find((h) => h.symbol.toUpperCase() === symbol);

  const hasAlertAt = (price: number) =>
    alerts.some((a) => a.symbol === symbol && Math.abs(a.level - price) / price < 0.0001);

  const levelRow = (label: string, price: number, color: string) => (
    <LevelRow
      key={`${label}:${price}`}
      label={label}
      price={price}
      color={color}
      hasAlert={hasAlertAt(price)}
      onAlert={() => createAlert(price, label)}
    />
  );

  const trendText =
    analysis?.trend?.direction === "up"
      ? t("analysis.trendUp")
      : analysis?.trend?.direction === "down"
        ? t("analysis.trendDown")
        : t("analysis.trendSide");
  const trendColor =
    analysis?.trend?.direction === "up"
      ? "var(--up)"
      : analysis?.trend?.direction === "down"
        ? "var(--down)"
        : "var(--muted)";

  const lastRsi = analysis ? [...analysis.rsi].reverse().find((v) => v !== null) ?? null : null;
  const lastMacd = analysis ? analysis.macd[analysis.macd.length - 1] : null;

  return (
    <div style={{ animation: "scin 0.3s ease both" }}>
      <div className="flex justify-between items-start mb-4 mt-1">
        <div className="text-[26px] font-extrabold tracking-tight">{t("analysis.title")}</div>
      </div>

      {/* Symbol picker */}
      <Card>
        <FormSelect
          label={t("analysis.symbolLabel")}
          value={picked || (symbol && picked !== "__custom__" ? symbol : "")}
          onChange={(e) => setPicked(e.target.value)}
        >
          {analyzable.map((h) => (
            <option key={h.id} value={h.symbol.toUpperCase()}>
              {h.symbol.toUpperCase()}
            </option>
          ))}
          <option value="__custom__">{t("analysis.customSymbol")}</option>
        </FormSelect>
        {picked === "__custom__" && (
          <div className="mt-3 flex flex-col gap-2">
            <FormInput
              label={t("analysis.customPlaceholder")}
              value={customSymbol}
              onChange={(e) => setCustomSymbol(e.target.value)}
            />
            <div className="flex gap-2">
              {(
                [
                  ["crypto", t("analysis.sourceCrypto")],
                  ["us", t("analysis.sourceUs")],
                  ["th", t("analysis.sourceTh")],
                ] as Array<[AnalysisSource, string]>
              ).map(([src, label]) => (
                <button
                  key={src}
                  onClick={() => setCustomSource(src)}
                  className="px-3 py-1.5 rounded-full text-[11.5px] font-semibold"
                  style={{
                    background: customSource === src ? "var(--accent)" : "var(--surface2)",
                    color: customSource === src ? "#04120c" : "var(--muted)",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {analysis && (
          <div className="flex items-center gap-3 mt-3 pt-3" style={{ borderTop: "var(--card-border)" }}>
            {activeHolding && (
              <div
                className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-none overflow-hidden"
                style={{ background: "var(--surface2)" }}
              >
                <AssetIcon
                  symbol={symbol}
                  assetClass={activeHolding.assetClass}
                  iconUrl={activeHolding.iconUrl}
                />
              </div>
            )}
            <div className="flex-1">
              <div className="text-[11px]" style={{ color: "var(--muted)" }}>
                {t("analysis.price")}
              </div>
              <div className="text-lg font-extrabold">
                {fmtPrice(analysis.lastClose)}{" "}
                <span className="text-[11px] font-normal" style={{ color: "var(--muted)" }}>
                  {unit}
                </span>
              </div>
            </div>
            {analysis.brk && (
              <span
                className="text-[11px] font-bold px-2.5 py-1.5 rounded-full"
                style={{
                  background:
                    analysis.brk.state === "breakout"
                      ? "var(--up)22"
                      : analysis.brk.state === "breakdown"
                        ? "var(--down)22"
                        : "var(--surface2)",
                  color:
                    analysis.brk.state === "breakout"
                      ? "var(--up)"
                      : analysis.brk.state === "breakdown"
                        ? "var(--down)"
                        : "var(--muted)",
                }}
              >
                {analysis.brk.state === "breakout"
                  ? `🎯 ${t("analysis.breakout")}`
                  : analysis.brk.state === "breakdown"
                    ? `🎯 ${t("analysis.breakdown")}`
                    : t("analysis.inRange")}
              </span>
            )}
          </div>
        )}
      </Card>

      {/* Timeframe chips */}
      <div className="flex gap-2 mt-3">
        {TIMEFRAMES.map((frame) => (
          <button
            key={frame}
            onClick={() => setTf(frame)}
            className="flex-1 py-2 rounded-[12px] text-[12px] font-bold"
            style={{
              background: tf === frame ? "var(--accent)" : "var(--surface2)",
              color: tf === frame ? "#04120c" : "var(--muted)",
            }}
          >
            {TF_LABEL[frame]}
          </button>
        ))}
      </div>

      {/* Chart */}
      <Card className="mt-3">
        {!loaded ? (
          <div className="text-sm text-center py-10" style={{ color: "var(--muted)" }}>
            {t("analysis.loading")}
          </div>
        ) : !analysis ? (
          <div className="text-sm text-center py-10" style={{ color: "var(--muted)" }}>
            <div className="mb-3">{t("analysis.noData")}</div>
            <button
              onClick={() => setRetryTick((n) => n + 1)}
              className="px-4 py-2 rounded-[10px] text-[12.5px] font-bold"
              style={{ background: "var(--surface2)", color: "var(--accent)" }}
            >
              {t("analysis.retry")}
            </button>
          </div>
        ) : (
          <>
            <div className="flex gap-1.5 flex-wrap mb-2">
              {(
                [
                  ["EMA", showEma, setShowEma],
                  ["S/R", showSr, setShowSr],
                  ["Pivot", showPivot, setShowPivot],
                  ["Fib", showFib, setShowFib],
                  ["Trend", showTrend, setShowTrend],
                ] as Array<[string, boolean, (v: boolean) => void]>
              ).map(([label, on, set]) => (
                <button
                  key={label}
                  onClick={() => set(!on)}
                  className="px-2.5 py-1 rounded-full text-[10.5px] font-semibold"
                  style={{
                    background: on ? "var(--accent)22" : "var(--surface2)",
                    color: on ? "var(--accent)" : "var(--muted)",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <AnalysisChart
              candles={candles}
              emaLines={showEma ? analysis.emas : []}
              levels={chartLevels}
              trend={showTrend ? analysis.trend : null}
              rsi={analysis.rsi}
              macd={analysis.macd}
              formatPrice={fmtPrice}
            />
            <div className="flex gap-3 flex-wrap mt-1">
              {EMA_PERIODS.map((e) => (
                <span key={e.period} className="text-[9.5px]" style={{ color: e.color }}>
                  ─ EMA{e.period}
                </span>
              ))}
            </div>
          </>
        )}
      </Card>

      {analysis && (
        <>
          {/* Support / Resistance + breakout alert */}
          <Card className="mt-3">
            <div className="text-[14px] font-bold mb-1">{t("analysis.levelsTitle")}</div>
            {[...analysis.sr.resistances]
              .reverse()
              .map((lv, i, arr) =>
                levelRow(`${t("analysis.resistance")} R${arr.length - i}`, lv, "var(--down)")
              )}
            <div
              className="text-[11.5px] py-1 flex justify-between"
              style={{ color: "var(--muted)" }}
            >
              <span>{t("analysis.price")}</span>
              <span className="font-bold" style={{ color: "var(--text)" }}>
                {fmtPrice(analysis.lastClose)}
              </span>
            </div>
            {analysis.sr.supports.map((lv, i) =>
              levelRow(`${t("analysis.support")} S${i + 1}`, lv, "var(--up)")
            )}
            {analysis.brk?.state === "inRange" && (
              <button
                onClick={createBreakAlerts}
                className="w-full rounded-[12px] py-2.5 text-[12.5px] font-bold mt-2"
                style={{ background: "var(--surface2)", color: "var(--accent)" }}
              >
                🎯 {t("analysis.breakAlertBtn")}
              </button>
            )}
          </Card>

          {/* Pivot points */}
          {analysis.pivots && (
            <Card className="mt-3">
              <div className="text-[14px] font-bold mb-1">{t("analysis.pivotTitle")}</div>
              {levelRow("R3", analysis.pivots.r3, "var(--down)")}
              {levelRow("R2", analysis.pivots.r2, "var(--down)")}
              {levelRow("R1", analysis.pivots.r1, "var(--down)")}
              {levelRow("Pivot (P)", analysis.pivots.pp, "#9b7bff")}
              {levelRow("S1", analysis.pivots.s1, "var(--up)")}
              {levelRow("S2", analysis.pivots.s2, "var(--up)")}
              {levelRow("S3", analysis.pivots.s3, "var(--up)")}
            </Card>
          )}

          {/* Fibonacci */}
          {analysis.fib && (
            <Card className="mt-3">
              <div className="text-[14px] font-bold mb-1">
                {t("analysis.fibTitle")}{" "}
                <span className="text-[10.5px] font-normal" style={{ color: "var(--muted)" }}>
                  ({fmtPrice(analysis.fib.swingLow)} → {fmtPrice(analysis.fib.swingHigh)})
                </span>
              </div>
              {analysis.fib.levels.map((f) =>
                levelRow(`Fib ${(f.ratio * 100).toFixed(1)}%`, f.price, "#b088ff")
              )}
            </Card>
          )}

          {/* Indicators */}
          <Card className="mt-3">
            <div className="text-[14px] font-bold mb-2">{t("analysis.indicatorsTitle")}</div>
            <div className="flex justify-between text-[12.5px] py-1">
              <span style={{ color: "var(--muted)" }}>{t("analysis.trendTitle")}</span>
              <span className="font-bold" style={{ color: trendColor }}>
                {trendText}
              </span>
            </div>
            <div className="flex justify-between text-[12.5px] py-1">
              <span style={{ color: "var(--muted)" }}>RSI (14)</span>
              <span className="font-bold">
                {lastRsi !== null ? lastRsi.toFixed(1) : "—"}{" "}
                <span
                  className="text-[10.5px] font-normal"
                  style={{
                    color:
                      lastRsi !== null && lastRsi >= 70
                        ? "var(--down)"
                        : lastRsi !== null && lastRsi <= 30
                          ? "var(--up)"
                          : "var(--muted)",
                  }}
                >
                  {lastRsi === null
                    ? ""
                    : lastRsi >= 70
                      ? t("analysis.overbought")
                      : lastRsi <= 30
                        ? t("analysis.oversold")
                        : t("analysis.neutralZone")}
                </span>
              </span>
            </div>
            <div className="flex justify-between text-[12.5px] py-1">
              <span style={{ color: "var(--muted)" }}>MACD (12,26,9)</span>
              <span
                className="font-bold"
                style={{
                  color:
                    lastMacd?.histogram == null
                      ? "var(--muted)"
                      : lastMacd.histogram > 0
                        ? "var(--up)"
                        : "var(--down)",
                }}
              >
                {lastMacd?.histogram == null
                  ? "—"
                  : lastMacd.histogram > 0
                    ? t("analysis.bullish")
                    : t("analysis.bearish")}
              </span>
            </div>
            {EMA_PERIODS.map((e) => {
              const v = analysis.emas.find((x) => x.period === e.period)?.series.at(-1) ?? null;
              return (
                <div key={e.period} className="flex justify-between text-[12.5px] py-1">
                  <span style={{ color: e.color }}>EMA {e.period}</span>
                  <span className="font-semibold">
                    {v === null || v === undefined ? "—" : fmtPrice(v)}
                  </span>
                </div>
              );
            })}
          </Card>

          {/* Multi-timeframe */}
          <Card className="mt-3">
            <div className="text-[14px] font-bold mb-2">☁️ {t("analysis.mtfTitle")}</div>
            <div
              className="grid text-[11.5px] gap-y-1.5"
              style={{ gridTemplateColumns: "1fr 1.4fr 1fr 1fr" }}
            >
              <span style={{ color: "var(--muted)" }}>TF</span>
              <span style={{ color: "var(--muted)" }}>{t("analysis.trendTitle")}</span>
              <span style={{ color: "var(--muted)" }}>RSI</span>
              <span style={{ color: "var(--muted)" }}>MACD</span>
              {mtf.map(({ frame, summary }) => (
                <MtfRow key={frame} frame={frame} summary={summary} t={t} />
              ))}
            </div>
          </Card>

          {/* Alerts */}
          <Card className="mt-3">
            <div className="text-[14px] font-bold mb-1">🔔 {t("analysis.alertsTitle")}</div>
            <div className="text-[10.5px] mb-2" style={{ color: "var(--muted)" }}>
              {t("analysis.alertNote")}
            </div>
            {lineConfigured === false && (
              <Link
                href="/settings"
                className="block text-[11px] rounded-[10px] px-3 py-2 mb-2"
                style={{ background: "var(--surface2)", color: "var(--accent)" }}
              >
                {t("analysis.lineNotConfigured")}
              </Link>
            )}
            {alerts.length === 0 && (
              <div className="text-[12px] py-3 text-center" style={{ color: "var(--muted)" }}>
                {t("analysis.noAlerts")}
              </div>
            )}
            {alerts.map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-[12px] py-1.5">
                <Icon
                  name={a.direction === "above" ? "trending_up" : "trending_down"}
                  style={{
                    fontSize: 15,
                    color: a.direction === "above" ? "var(--down)" : "var(--up)",
                  }}
                />
                <span className="flex-1 min-w-0 truncate">
                  <b>{a.symbol}</b> {a.label} · {fmtPrice(a.level)} {quoteUnit(a.source)}
                </span>
                {a.lastFiredMs && (
                  <span className="text-[10px] flex-none" style={{ color: "var(--accent)" }}>
                    ✓ {t("analysis.fired")}
                  </span>
                )}
                <button
                  onClick={() => user && deletePriceAlert(user.uid, a.id)}
                  style={{ color: "var(--muted)" }}
                >
                  <Icon name="close" style={{ fontSize: 15 }} />
                </button>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}

// Kept outside the component so the impure Date.now() call is clearly on
// the event path, not in render.
function buildAlert(
  symbol: string,
  source: AnalysisSource,
  level: number,
  direction: "above" | "below",
  label: string
) {
  return { symbol, source, level, direction, label, createdAtMs: Date.now() };
}

function LevelRow({
  label,
  price,
  color,
  hasAlert,
  onAlert,
}: {
  label: string;
  price: number;
  color: string;
  hasAlert: boolean;
  onAlert: () => void;
}) {
  return (
    <div className="flex items-center justify-between text-[12.5px] py-1">
      <span style={{ color }}>{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-semibold">{fmtPrice(price)}</span>
        <button
          onClick={() => !hasAlert && onAlert()}
          style={{ color: hasAlert ? "var(--accent)" : "var(--muted)" }}
          aria-label="set alert"
        >
          <Icon name={hasAlert ? "notifications_active" : "notifications"} style={{ fontSize: 15 }} />
        </button>
      </div>
    </div>
  );
}

function MtfRow({
  frame,
  summary,
  t,
}: {
  frame: Tf;
  summary: ReturnType<typeof summarize>;
  t: (k: string) => string;
}) {
  if (!summary) {
    return (
      <>
        <span className="font-bold">{TF_LABEL[frame]}</span>
        <span style={{ color: "var(--muted)" }}>—</span>
        <span style={{ color: "var(--muted)" }}>—</span>
        <span style={{ color: "var(--muted)" }}>—</span>
      </>
    );
  }
  const trendColor =
    summary.trend === "up" ? "var(--up)" : summary.trend === "down" ? "var(--down)" : "var(--muted)";
  const trendText =
    summary.trend === "up"
      ? `▲ ${t("analysis.trendUp")}`
      : summary.trend === "down"
        ? `▼ ${t("analysis.trendDown")}`
        : `− ${t("analysis.trendSide")}`;
  return (
    <>
      <span className="font-bold">{TF_LABEL[frame]}</span>
      <span className="font-semibold" style={{ color: trendColor }}>
        {trendText}
      </span>
      <span
        style={{
          color:
            summary.rsi !== null && summary.rsi >= 70
              ? "var(--down)"
              : summary.rsi !== null && summary.rsi <= 30
                ? "var(--up)"
                : "var(--text)",
        }}
      >
        {summary.rsi === null ? "—" : summary.rsi.toFixed(0)}
      </span>
      <span
        style={{
          color:
            summary.macdBullish === null
              ? "var(--muted)"
              : summary.macdBullish
                ? "var(--up)"
                : "var(--down)",
        }}
      >
        {summary.macdBullish === null ? "—" : summary.macdBullish ? "+" : "−"}
      </span>
    </>
  );
}
