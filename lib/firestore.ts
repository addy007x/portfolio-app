import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type {
  Holding,
  Transaction,
  Dividend,
  Portfolio,
  ValueSnapshot,
  EarnPosition,
  AssetClass,
} from "@/lib/types";
import { ASSET_CLASS_COLOR, assetClassLabel } from "@/lib/types";

function userCollection(uid: string, name: string) {
  return collection(db, "users", uid, name);
}

// ---- generic live-list subscription ----
function watchCollection<T extends { id: string }>(
  uid: string,
  name: string,
  orderField: string,
  cb: (items: T[]) => void
): Unsubscribe {
  const q = query(userCollection(uid, name), orderBy(orderField, "desc"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T));
  });
}

// ---- Holdings ----
export function watchHoldings(uid: string, cb: (items: Holding[]) => void) {
  return watchCollection<Holding>(uid, "holdings", "symbol", cb);
}

export async function addHolding(uid: string, data: Omit<Holding, "id">) {
  await addDoc(userCollection(uid, "holdings"), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function updateHolding(
  uid: string,
  id: string,
  data: Partial<Omit<Holding, "id">>
) {
  await updateDoc(doc(db, "users", uid, "holdings", id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteHolding(uid: string, id: string) {
  await deleteDoc(doc(db, "users", uid, "holdings", id));
}

// ---- Transactions ----
export function watchTransactions(
  uid: string,
  cb: (items: Transaction[]) => void
) {
  return watchCollection<Transaction>(uid, "transactions", "date", cb);
}

export async function addTransaction(
  uid: string,
  data: Omit<Transaction, "id">
) {
  await addDoc(userCollection(uid, "transactions"), {
    ...data,
    createdAt: serverTimestamp(),
  });
}

export async function updateTransaction(
  uid: string,
  id: string,
  data: Partial<Omit<Transaction, "id">>
) {
  await updateDoc(doc(db, "users", uid, "transactions", id), data);
}

export async function deleteTransaction(uid: string, id: string) {
  await deleteDoc(doc(db, "users", uid, "transactions", id));
}

// ---- Dividends ----
export function watchDividends(uid: string, cb: (items: Dividend[]) => void) {
  return watchCollection<Dividend>(uid, "dividends", "paymentDate", cb);
}

export async function addDividend(uid: string, data: Omit<Dividend, "id">) {
  await addDoc(userCollection(uid, "dividends"), data);
}

export async function deleteDividend(uid: string, id: string) {
  await deleteDoc(doc(db, "users", uid, "dividends", id));
}

// ---- Portfolios (multi-portfolio segregation) ----
export function watchPortfolios(uid: string, cb: (items: Portfolio[]) => void) {
  const q = query(userCollection(uid, "portfolios"), orderBy("createdAtMs", "asc"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Portfolio));
  });
}

export async function addPortfolio(uid: string, name: string): Promise<string> {
  const ref = await addDoc(userCollection(uid, "portfolios"), {
    name,
    createdAtMs: Date.now(),
  });
  return ref.id;
}

export async function deletePortfolio(uid: string, id: string) {
  await deleteDoc(doc(db, "users", uid, "portfolios", id));
}

export async function updatePortfolio(
  uid: string,
  id: string,
  data: Partial<Omit<Portfolio, "id">>
) {
  await updateDoc(doc(db, "users", uid, "portfolios", id), data);
}

// Sentinel for a holding explicitly detached from a portfolio via "remove
// from portfolio" — distinct from `undefined` (never tagged / legacy data),
// which falls back to the account's default portfolio. An unassigned
// holding matches no portfolio at all until the user re-adds it somewhere.
export const UNASSIGNED_PORTFOLIO_ID = "__unassigned__";

// A holding/transaction created before multi-portfolio support has no
// portfolioId at all; treat those as living in the account's original
// (default) portfolio rather than making them vanish from every view.
export function belongsToPortfolio(
  item: { portfolioId?: string },
  currentPortfolioId: string | null,
  defaultPortfolioId: string | null
): boolean {
  if (!currentPortfolioId) return true;
  if (item.portfolioId === UNASSIGNED_PORTFOLIO_ID) return false;
  const effectiveId = item.portfolioId ?? defaultPortfolioId;
  return effectiveId === currentPortfolioId;
}

// A symbol may only live in one portfolio at a time. Returns the id of the
// portfolio it's already in if adding it to `targetPortfolioId` would create
// a duplicate elsewhere, or null if there's no conflict (including when the
// existing holding has been explicitly removed from its portfolio already).
export function findSymbolPortfolioConflict(
  holdings: Holding[],
  symbol: string,
  targetPortfolioId: string,
  defaultPortfolioId: string | null
): string | null {
  const upper = symbol.toUpperCase();
  const existing = holdings.find((h) => h.symbol.toUpperCase() === upper);
  if (!existing) return null;
  if (existing.portfolioId === UNASSIGNED_PORTFOLIO_ID) return null;
  const existingPortfolioId = existing.portfolioId ?? defaultPortfolioId;
  if (!existingPortfolioId || existingPortfolioId === targetPortfolioId) return null;
  return existingPortfolioId;
}

// ---- Value history (daily portfolio-value snapshots, one series per portfolio) ----
export function watchValueHistory(
  uid: string,
  cb: (items: ValueSnapshot[]) => void
) {
  return watchCollection<ValueSnapshot>(uid, "valueHistory", "date", cb);
}

// One document per portfolio per calendar day (doc id = `${portfolioId}_${date}`),
// overwritten on every poll so repeated opens the same day don't duplicate.
export async function recordValueSnapshot(
  uid: string,
  portfolioId: string,
  date: string,
  totalValue: number
) {
  await setDoc(
    doc(db, "users", uid, "valueHistory", `${portfolioId}_${date}`),
    { date, totalValue, portfolioId },
    { merge: true }
  );
}

// ---- Earn (simulated flexible-savings/staking positions) ----
export function watchEarnPositions(
  uid: string,
  cb: (items: EarnPosition[]) => void
) {
  return watchCollection<EarnPosition>(uid, "earnPositions", "startDate", cb);
}

export async function addEarnPosition(uid: string, data: Omit<EarnPosition, "id">) {
  await addDoc(userCollection(uid, "earnPositions"), data);
}

export async function deleteEarnPosition(uid: string, id: string) {
  await deleteDoc(doc(db, "users", uid, "earnPositions", id));
}

export async function updateEarnPosition(
  uid: string,
  id: string,
  data: Partial<Omit<EarnPosition, "id">>
) {
  await updateDoc(doc(db, "users", uid, "earnPositions", id), data);
}

// One-time repair for positions created before the coin-quantity model
// (they only had a THB `principal`, no `quantity`/`costBasisPrice`, which
// otherwise computes as NaN everywhere and previously crashed the value
// chart). Converts principal -> quantity using the current market price —
// the same approximation new deposits use, since historical prices aren't
// available on the free tier this app runs on. Safe to call repeatedly:
// once migrated, it's a no-op.
export async function migrateLegacyEarnPosition(
  uid: string,
  position: EarnPosition,
  priceMap: Record<string, number>
): Promise<void> {
  const raw = position as unknown as Record<string, unknown>;
  if (typeof raw.quantity === "number" && typeof raw.costBasisPrice === "number") return;
  const legacyPrincipal = typeof raw.principal === "number" ? raw.principal : null;
  if (legacyPrincipal === null) return; // genuinely malformed, nothing to recover
  const price = priceMap[position.symbol];
  if (!price) return; // wait until a live price is available
  await updateEarnPosition(uid, position.id, {
    quantity: legacyPrincipal / price,
    costBasisPrice: price,
  });
}

// Exact (fractional) days between two dates, used for continuous
// real-time compounding — no flooring, so the value ticks up every
// second rather than jumping once per calendar day.
function daysBetweenExact(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 86_400_000;
}

// A map of symbol -> current market price (THB per unit), fetched live via
// /api/prices?crypto=. Passed into every function below instead of each one
// fetching its own, since price is a render-time input, not something these
// pure functions should own.
export type EarnPriceMap = Record<string, number>;

// Coin quantity compounds continuously — this is the actual "interest paid
// in the same coin" a real staking/savings product credits, independent of
// that coin's market price.
export function earnPositionQuantity(p: EarnPosition, asOf: Date = new Date()): number {
  const start = new Date(p.startDate);
  if (asOf < start) return 0;
  const days = daysBetweenExact(start, asOf);
  const dailyRate = p.apy / 100 / 365;
  return p.quantity * Math.pow(1 + dailyRate, days);
}

function priceFor(p: EarnPosition, priceMap: EarnPriceMap): number {
  return priceMap[p.symbol] ?? p.costBasisPrice;
}

// THB value at a given instant: compounded coin quantity times the current
// market price (falls back to the cost-basis price if a live quote isn't
// available), so this reflects both the staking yield and the coin's own
// price movement — same as a real holding's PnL would.
export function earnPositionValue(
  p: EarnPosition,
  priceMap: EarnPriceMap,
  asOf: Date = new Date()
): number {
  return earnPositionQuantity(p, asOf) * priceFor(p, priceMap);
}

export interface DailyInterest {
  date: string; // YYYY-MM-DD
  coinInterest: number; // units of the coin itself credited that day
  thbInterest: number; // that day's coin interest valued at today's price
}

// Interest earned on each of the last `days` calendar days (fewer if the
// position started more recently), derived from the same compounding
// formula rather than a stored ledger — coin quantity on day minus coin
// quantity the day before. On the deposit's first day, the baseline is the
// deposited quantity itself (not 0), so that day shows the actual interest
// accrued rather than the whole deposit misleadingly appearing as "interest".
// THB value uses today's price throughout since historical prices aren't
// available on the free tier this app runs on.
export function computeDailyInterest(
  p: EarnPosition,
  priceMap: EarnPriceMap,
  days = 14,
  asOf: Date = new Date()
): DailyInterest[] {
  const start = new Date(p.startDate);
  const price = priceFor(p, priceMap);
  const result: DailyInterest[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const dayEnd = new Date(asOf);
    dayEnd.setDate(dayEnd.getDate() - i);
    if (dayEnd < start) continue;
    const dayStart = new Date(dayEnd);
    dayStart.setDate(dayStart.getDate() - 1);
    const baselineQty = dayStart < start ? p.quantity : earnPositionQuantity(p, dayStart);
    const coinInterest = earnPositionQuantity(p, dayEnd) - baselineQty;
    result.push({
      date: dayEnd.toISOString().slice(0, 10),
      coinInterest,
      thbInterest: coinInterest * price,
    });
  }
  return result;
}

export interface EarnSummary {
  totalValue: number;
  totalPrincipal: number;
  totalGain: number;
  totalGainPct: number;
  history: ValueSnapshot[];
}

const HISTORY_POINTS = 30;

// Builds a real (not simulated-market) series from each position's own APY
// and elapsed time, so the chart is honest even though it isn't backed by
// stored daily snapshots. Samples a fixed number of evenly-spaced instants
// between the effective start and `asOf` — rather than one point per whole
// calendar day — so a position started earlier today still shows a real
// (if short) growth curve instead of needing to wait until tomorrow for a
// second data point. `asOf` also drives the headline totals, so passing a
// ticking clock keeps the graph in sync with the live numbers. Each sampled
// point uses today's price throughout (see computeDailyInterest's note).
//
// `rangeStart`, if given and later than the earliest position's actual
// start, zooms the chart into that window (e.g. "last 24H") without
// touching the headline totals, which always reflect every position.
export function computeEarnSummary(
  positions: EarnPosition[],
  priceMap: EarnPriceMap,
  asOf: Date = new Date(),
  rangeStart?: Date
): EarnSummary {
  const totalPrincipal = positions.reduce((s, p) => s + p.quantity * p.costBasisPrice, 0);
  const totalValue = positions.reduce((s, p) => s + earnPositionValue(p, priceMap, asOf), 0);
  const totalGain = totalValue - totalPrincipal;
  const totalGainPct = totalPrincipal > 0 ? (totalGain / totalPrincipal) * 100 : 0;

  const history: ValueSnapshot[] = [];
  if (positions.length > 0) {
    const earliest = positions.reduce(
      (min, p) => (p.startDate < min ? p.startDate : min),
      positions[0].startDate
    );
    const lifetimeStart = new Date(earliest);
    const start = rangeStart && rangeStart > lifetimeStart ? rangeStart : lifetimeStart;
    const spanMs = Math.max(0, asOf.getTime() - start.getTime());
    for (let i = 0; i <= HISTORY_POINTS; i++) {
      const t = new Date(start.getTime() + (spanMs * i) / HISTORY_POINTS);
      const value = positions.reduce((s, p) => s + earnPositionValue(p, priceMap, t), 0);
      // Full ISO (not just the date) so tooltips can show sub-day precision.
      history.push({ id: `${t.toISOString()}-${i}`, date: t.toISOString(), totalValue: value });
    }
  }

  return { totalValue, totalPrincipal, totalGain, totalGainPct, history };
}

export interface EarnGroup {
  symbol: string;
  apy: number; // taken from whichever position in the group is worth the most right now
  totalValue: number; // summed across every position sharing this symbol
  totalPrincipal: number;
  totalQuantity: number; // summed coin units across every position sharing this symbol
  positionIds: string[];
}

// Duplicate deposits of the same symbol are shown as one row: the total is
// the sum of every position (so nothing is dropped from the portfolio's
// total), but the APY label shown for that row comes from whichever
// individual position is currently worth the most.
export function groupEarnPositionsBySymbol(
  positions: EarnPosition[],
  priceMap: EarnPriceMap,
  asOf: Date = new Date()
): EarnGroup[] {
  const bySymbol = new Map<string, EarnPosition[]>();
  for (const p of positions) {
    const list = bySymbol.get(p.symbol) ?? [];
    list.push(p);
    bySymbol.set(p.symbol, list);
  }
  return Array.from(bySymbol.entries())
    .map(([symbol, list]) => {
      const withValue = list
        .map((p) => ({ p, value: earnPositionValue(p, priceMap, asOf) }))
        .sort((a, b) => b.value - a.value);
      const dominant = withValue[0].p;
      return {
        symbol,
        apy: dominant.apy,
        totalValue: withValue.reduce((s, x) => s + x.value, 0),
        totalPrincipal: list.reduce((s, p) => s + p.quantity * p.costBasisPrice, 0),
        totalQuantity: list.reduce((s, p) => s + earnPositionQuantity(p, asOf), 0),
        positionIds: list.map((p) => p.id),
      };
    })
    .sort((a, b) => b.totalValue - a.totalValue);
}

// ---- User profile ----
export interface UserProfile {
  name: string;
  email: string;
  currency: string;
  theme: string;
  language: string;
  currentPortfolioId?: string;
  defaultPortfolioId?: string;
}

export async function updateUserProfile(
  uid: string,
  data: Partial<UserProfile>
) {
  await setDoc(doc(db, "users", uid), data, { merge: true });
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

// ---- Derived aggregates ----
export interface PortfolioSummary {
  totalValue: number;
  totalCost: number;
  pnl: number;
  pnlPct: number;
}

export function computePortfolioSummary(holdings: Holding[]): PortfolioSummary {
  const totalValue = holdings.reduce(
    (sum, h) => sum + h.quantity * h.currentPrice,
    0
  );
  const totalCost = holdings.reduce(
    (sum, h) => sum + h.quantity * h.avgCost,
    0
  );
  const pnl = totalValue - totalCost;
  const pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : 0;
  return { totalValue, totalCost, pnl, pnlPct };
}

export interface AllocationSlice {
  assetClass: AssetClass;
  name: string;
  color: string;
  value: number;
  pct: number;
}

export interface HoldingStats {
  quantity: number;
  avgCost: number;
  lastPrice: number;
}

// Recomputed from the full transaction history for one symbol, so editing
// or deleting a past transaction always leaves quantity/avgCost consistent
// (rather than incrementally patching them at write time).
export function computeHoldingStats(transactions: Transaction[]): HoldingStats {
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  let quantity = 0;
  let costBasis = 0;
  let lastPrice = 0;
  for (const t of sorted) {
    if (t.type === "buy") {
      quantity += t.quantity;
      costBasis += t.quantity * t.price;
      lastPrice = t.price;
    } else if (t.type === "sell") {
      const avgCost = quantity > 0 ? costBasis / quantity : 0;
      quantity = Math.max(0, quantity - t.quantity);
      costBasis = quantity > 0 ? quantity * avgCost : 0;
      lastPrice = t.price;
    }
  }
  return {
    quantity,
    avgCost: quantity > 0 ? costBasis / quantity : 0,
    lastPrice,
  };
}

// Quantity actually held as of a given date, derived from the buy/sell
// transaction history for that symbol — this is what a dividend payout
// should be multiplied against, not today's holding quantity, since shares
// may have been bought or sold between the ex-date and now.
export function quantityHeldAsOf(
  transactions: Transaction[],
  symbol: string,
  asOfDate: string
): number {
  return computeHoldingStats(
    transactions.filter((t) => t.symbol === symbol && t.date <= asOfDate)
  ).quantity;
}

export function computeAllocation(
  holdings: Holding[],
  language: "th" | "en" = "th"
): AllocationSlice[] {
  const byClass = new Map<AssetClass, number>();
  let total = 0;
  for (const h of holdings) {
    const value = h.quantity * h.currentPrice;
    byClass.set(h.assetClass, (byClass.get(h.assetClass) ?? 0) + value);
    total += value;
  }
  return Array.from(byClass.entries())
    .map(([assetClass, value]) => ({
      assetClass,
      name: assetClassLabel(assetClass, language),
      color: ASSET_CLASS_COLOR[assetClass],
      value,
      pct: total > 0 ? (value / total) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);
}
