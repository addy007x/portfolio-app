"use client";

import type { Candle, MacdPoint, TrendLine } from "@/lib/technical";
import { closeOf } from "@/lib/technical";

export interface LevelLine {
  price: number;
  color: string;
  label: string;
}

// Price panel with EMA overlays, horizontal levels (S/R, pivots, fib) and a
// regression trend line, plus optional RSI / MACD panels underneath. Pure
// SVG — no chart library.
export function AnalysisChart({
  candles,
  emaLines,
  levels,
  trend,
  rsi,
  macd,
  formatPrice,
}: {
  candles: Candle[];
  emaLines: Array<{ period: number; color: string; series: Array<number | null> }>;
  levels: LevelLine[];
  trend: TrendLine | null;
  rsi: Array<number | null> | null;
  macd: MacdPoint[] | null;
  formatPrice: (v: number) => string;
}) {
  const W = 340;
  const H = 190;
  const PAD_R = 44; // room for level labels on the right edge

  if (candles.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-xs"
        style={{ height: 190, color: "var(--muted)" }}
      >
        —
      </div>
    );
  }

  const closes = candles.map(closeOf);
  const minClose = Math.min(...closes);
  const maxClose = Math.max(...closes);
  // Include levels near the price range so their lines are visible, but
  // don't let a far-away level (e.g. R3) flatten the whole price curve.
  const visibleLevels = levels.filter(
    (l) => l.price > minClose - (maxClose - minClose) * 0.25 && l.price < maxClose + (maxClose - minClose) * 0.25
  );
  const yMin = Math.min(minClose, ...visibleLevels.map((l) => l.price));
  const yMax = Math.max(maxClose, ...visibleLevels.map((l) => l.price));
  const range = yMax - yMin || 1;
  const plotW = W - PAD_R;
  const x = (i: number) => (i / (candles.length - 1)) * plotW;
  const y = (v: number) => 8 + (1 - (v - yMin) / range) * (H - 16);

  const pricePath = closes.map((c, i) => `${x(i).toFixed(1)},${y(c).toFixed(1)}`).join(" ");

  return (
    <div className="flex flex-col gap-1">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
        {visibleLevels.map((l, idx) => (
          <g key={idx}>
            <line
              x1={0}
              x2={plotW}
              y1={y(l.price)}
              y2={y(l.price)}
              stroke={l.color}
              strokeWidth={0.7}
              strokeDasharray="4 3"
              opacity={0.75}
            />
            <text
              x={plotW + 2}
              y={y(l.price) + 2.5}
              fontSize={6.5}
              fill={l.color}
            >
              {l.label} {formatPrice(l.price)}
            </text>
          </g>
        ))}
        {trend && (
          <line
            x1={x(0)}
            y1={y(trend.intercept)}
            x2={x(candles.length - 1)}
            y2={y(trend.intercept + trend.slope * (candles.length - 1))}
            stroke="#f5c542"
            strokeWidth={1}
            strokeDasharray="6 3"
            opacity={0.9}
          />
        )}
        {emaLines.map((e) => {
          const pts = e.series
            .map((v, i) => (v === null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`))
            .filter((p): p is string => p !== null)
            .join(" ");
          return pts ? (
            <polyline
              key={e.period}
              points={pts}
              fill="none"
              stroke={e.color}
              strokeWidth={0.9}
              opacity={0.9}
            />
          ) : null;
        })}
        <polyline points={pricePath} fill="none" stroke="var(--accent)" strokeWidth={1.6} />
      </svg>

      {rsi && <RsiPanel rsi={rsi} plotW={plotW} W={W} />}
      {macd && <MacdPanel macd={macd} plotW={plotW} W={W} />}
    </div>
  );
}

function RsiPanel({ rsi, plotW, W }: { rsi: Array<number | null>; plotW: number; W: number }) {
  const H = 56;
  const y = (v: number) => 4 + (1 - v / 100) * (H - 8);
  const x = (i: number) => (i / (rsi.length - 1)) * plotW;
  const pts = rsi
    .map((v, i) => (v === null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`))
    .filter((p): p is string => p !== null)
    .join(" ");
  const last = [...rsi].reverse().find((v) => v !== null);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
      {[70, 30].map((g) => (
        <g key={g}>
          <line
            x1={0}
            x2={plotW}
            y1={y(g)}
            y2={y(g)}
            stroke="var(--muted)"
            strokeWidth={0.5}
            strokeDasharray="3 3"
            opacity={0.5}
          />
          <text x={plotW + 2} y={y(g) + 2.5} fontSize={6.5} fill="var(--muted)">
            {g}
          </text>
        </g>
      ))}
      {pts && <polyline points={pts} fill="none" stroke="#b088ff" strokeWidth={1.2} />}
      <text x={2} y={9} fontSize={7} fill="#b088ff" fontWeight={700}>
        RSI {last !== undefined && last !== null ? last.toFixed(1) : ""}
      </text>
    </svg>
  );
}

function MacdPanel({ macd, plotW, W }: { macd: MacdPoint[]; plotW: number; W: number }) {
  const H = 56;
  const vals = macd.flatMap((m) => [m.macd, m.signal, m.histogram]).filter((v): v is number => v !== null);
  if (!vals.length) return null;
  const maxAbs = Math.max(...vals.map(Math.abs)) || 1;
  const y = (v: number) => H / 2 - (v / maxAbs) * (H / 2 - 6);
  const x = (i: number) => (i / (macd.length - 1)) * plotW;
  const line = (key: "macd" | "signal") =>
    macd
      .map((m, i) => (m[key] === null ? null : `${x(i).toFixed(1)},${y(m[key] as number).toFixed(1)}`))
      .filter((p): p is string => p !== null)
      .join(" ");
  const barW = Math.max(0.8, plotW / macd.length - 0.5);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
      <line x1={0} x2={plotW} y1={H / 2} y2={H / 2} stroke="var(--muted)" strokeWidth={0.5} opacity={0.5} />
      {macd.map((m, i) =>
        m.histogram === null ? null : (
          <rect
            key={i}
            x={x(i) - barW / 2}
            y={Math.min(y(m.histogram), H / 2)}
            width={barW}
            height={Math.abs(y(m.histogram) - H / 2) || 0.5}
            fill={m.histogram >= 0 ? "var(--up)" : "var(--down)"}
            opacity={0.55}
          />
        )
      )}
      <polyline points={line("macd")} fill="none" stroke="#4c8dff" strokeWidth={1} />
      <polyline points={line("signal")} fill="none" stroke="#ff9f43" strokeWidth={1} />
      <text x={2} y={9} fontSize={7} fill="#4c8dff" fontWeight={700}>
        MACD
      </text>
    </svg>
  );
}
