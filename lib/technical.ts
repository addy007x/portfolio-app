// Pure technical-analysis math over OHLC candles. No I/O here — candles
// come from /api/prices?candles=... (Binance for crypto, Yahoo for stocks).

// [epochMs, open, high, low, close]
export type Candle = [number, number, number, number, number];

export const closeOf = (c: Candle) => c[4];

// ---- Moving averages ----
export function emaSeries(closes: number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(closes.length).fill(null);
  if (closes.length < period) return out;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = ema;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

// ---- RSI (Wilder, 14) ----
export function rsiSeries(closes: number[], period = 14): Array<number | null> {
  const out: Array<number | null> = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(0, d)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -d)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

// ---- MACD (12, 26, 9) ----
export interface MacdPoint {
  macd: number | null;
  signal: number | null;
  histogram: number | null;
}

export function macdSeries(closes: number[]): MacdPoint[] {
  const fast = emaSeries(closes, 12);
  const slow = emaSeries(closes, 26);
  const macdLine: Array<number | null> = closes.map((_, i) =>
    fast[i] !== null && slow[i] !== null ? (fast[i] as number) - (slow[i] as number) : null
  );
  // Signal = EMA9 of the macd line, computed over its non-null tail.
  const firstIdx = macdLine.findIndex((v) => v !== null);
  const signal: Array<number | null> = new Array(closes.length).fill(null);
  if (firstIdx >= 0) {
    const tail = macdLine.slice(firstIdx) as number[];
    const sig = emaSeries(tail, 9);
    for (let i = 0; i < sig.length; i++) signal[firstIdx + i] = sig[i];
  }
  return closes.map((_, i) => ({
    macd: macdLine[i],
    signal: signal[i],
    histogram:
      macdLine[i] !== null && signal[i] !== null
        ? (macdLine[i] as number) - (signal[i] as number)
        : null,
  }));
}

// ---- Classic pivot points from the last COMPLETED candle ----
export interface PivotLevels {
  pp: number;
  r1: number;
  r2: number;
  r3: number;
  s1: number;
  s2: number;
  s3: number;
}

export function pivotPoints(prev: Candle): PivotLevels {
  const [, , high, low, close] = prev;
  const pp = (high + low + close) / 3;
  return {
    pp,
    r1: 2 * pp - low,
    s1: 2 * pp - high,
    r2: pp + (high - low),
    s2: pp - (high - low),
    r3: high + 2 * (pp - low),
    s3: low - 2 * (high - pp),
  };
}

// ---- Fibonacci retracement over the loaded window's swing ----
export interface FibLevels {
  swingHigh: number;
  swingLow: number;
  uptrend: boolean; // retracing an up-move (levels measured down from the high)
  levels: Array<{ ratio: number; price: number }>;
}

const FIB_RATIOS = [0.236, 0.382, 0.5, 0.618, 0.786];

export function fibRetracement(candles: Candle[]): FibLevels | null {
  if (candles.length < 2) return null;
  let hiIdx = 0;
  let loIdx = 0;
  candles.forEach((c, i) => {
    if (c[2] > candles[hiIdx][2]) hiIdx = i;
    if (c[3] < candles[loIdx][3]) loIdx = i;
  });
  const swingHigh = candles[hiIdx][2];
  const swingLow = candles[loIdx][3];
  const range = swingHigh - swingLow;
  if (range <= 0) return null;
  const uptrend = loIdx < hiIdx; // low came first → the primary move was up
  const levels = FIB_RATIOS.map((ratio) => ({
    ratio,
    price: uptrend ? swingHigh - range * ratio : swingLow + range * ratio,
  }));
  return { swingHigh, swingLow, uptrend, levels };
}

// ---- Swing-based support / resistance ----
// Local extrema (a high/low that beats its k neighbours on each side),
// clustered so near-duplicate levels merge, split into levels above
// (resistance) and below (support) the current price.
export interface SupportResistance {
  resistances: number[]; // ascending: nearest first
  supports: number[]; // descending: nearest first
}

export function supportResistance(candles: Candle[], k = 3): SupportResistance {
  const last = candles[candles.length - 1];
  const price = last ? closeOf(last) : 0;
  const raw: number[] = [];
  for (let i = k; i < candles.length - k; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (candles[j][2] >= candles[i][2]) isHigh = false;
      if (candles[j][3] <= candles[i][3]) isLow = false;
    }
    if (isHigh) raw.push(candles[i][2]);
    if (isLow) raw.push(candles[i][3]);
  }
  raw.sort((a, b) => a - b);
  // Merge levels within 0.5% of each other into their average.
  const merged: number[] = [];
  for (const lv of raw) {
    const prev = merged[merged.length - 1];
    if (prev !== undefined && (lv - prev) / prev < 0.005) {
      merged[merged.length - 1] = (prev + lv) / 2;
    } else {
      merged.push(lv);
    }
  }
  return {
    resistances: merged.filter((lv) => lv > price).slice(0, 3),
    supports: merged
      .filter((lv) => lv < price)
      .reverse()
      .slice(0, 3),
  };
}

// ---- Linear-regression trend line over the closes ----
export interface TrendLine {
  slope: number; // price units per candle
  intercept: number; // price at index 0
  direction: "up" | "down" | "side";
}

export function trendLine(closes: number[]): TrendLine | null {
  const n = closes.length;
  if (n < 2) return null;
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sx += i;
    sy += closes[i];
    sxy += i * closes[i];
    sxx += i * i;
  }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const intercept = (sy - slope * sx) / n;
  const avg = sy / n;
  // Direction: total move across the window relative to the average price.
  const movePct = ((slope * (n - 1)) / avg) * 100;
  const direction = movePct > 1.5 ? "up" : movePct < -1.5 ? "down" : "side";
  return { slope, intercept, direction };
}

// ---- Breakout / breakdown vs the nearest swing levels ----
// Levels are computed EXCLUDING the last candle, then the last candle's
// close is compared against them — so a fresh cross reads as a break.
export type BreakState =
  | { state: "breakout"; level: number }
  | { state: "breakdown"; level: number }
  | { state: "inRange"; resistance: number | null; support: number | null };

export function breakState(candles: Candle[]): BreakState | null {
  if (candles.length < 10) return null;
  const prior = candles.slice(0, -1);
  const lastClose = closeOf(candles[candles.length - 1]);
  const prevClose = closeOf(prior[prior.length - 1]);
  const priorPrice = prevClose;
  const raw = supportResistanceAt(prior, priorPrice);
  const nearestR = raw.resistances[0] ?? null;
  const nearestS = raw.supports[0] ?? null;
  if (nearestR !== null && lastClose > nearestR && prevClose <= nearestR) {
    return { state: "breakout", level: nearestR };
  }
  if (nearestS !== null && lastClose < nearestS && prevClose >= nearestS) {
    return { state: "breakdown", level: nearestS };
  }
  return { state: "inRange", resistance: nearestR, support: nearestS };
}

function supportResistanceAt(candles: Candle[], price: number): SupportResistance {
  const sr = supportResistance(candles);
  const all = [...sr.supports, ...sr.resistances].sort((a, b) => a - b);
  return {
    resistances: all.filter((lv) => lv > price).slice(0, 3),
    supports: all
      .filter((lv) => lv < price)
      .reverse()
      .slice(0, 3),
  };
}

// ---- One-line summary per timeframe (for the multi-TF table) ----
export interface TfSummary {
  trend: "up" | "down" | "side"; // EMA alignment
  rsi: number | null;
  macdBullish: boolean | null; // histogram sign
  close: number;
}

export function summarize(candles: Candle[]): TfSummary | null {
  if (candles.length < 30) return null;
  const closes = candles.map(closeOf);
  const last = closes.length - 1;
  const e20 = emaSeries(closes, 20)[last];
  const e50 = emaSeries(closes, 50)[last];
  const e200 = emaSeries(closes, 200)[last];
  const rsi = rsiSeries(closes)[last];
  const macd = macdSeries(closes)[last];
  const close = closes[last];
  let trend: TfSummary["trend"] = "side";
  if (e20 !== null && e50 !== null) {
    const aboveLong = e200 === null || close > e200;
    const belowLong = e200 === null || close < e200;
    if (e20 > e50 && close > e20 && aboveLong) trend = "up";
    else if (e20 < e50 && close < e20 && belowLong) trend = "down";
  }
  return {
    trend,
    rsi: rsi ?? null,
    macdBullish: macd.histogram === null ? null : macd.histogram > 0,
    close,
  };
}
