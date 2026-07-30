import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  where,
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
  InvestPlan,
  PriceAlert,
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

export interface BrokerPosition {
  symbol: string;
  quantity: number;
  costPrice: number; // USD per share
  lastPrice: number; // USD per share
}

export interface HoldingSyncResult {
  added: number;
  updated: number;
  removed: number;
}

// Asset classes a Webull position can correspond to. Anything else the user
// holds (crypto, Thai stocks, cash) is invisible to this broker and must
// never be touched by the sync — see the removal guard below.
const BROKER_ASSET_CLASSES = new Set<AssetClass>(["foreign_stock", "etf"]);

// Mirrors a broker's positions into holdings, making the broker
// authoritative for the symbols it reports.
//
// Matching is by symbol rather than by a stored broker id, so a holding the
// user originally typed in by hand gets adopted by the sync instead of
// becoming a duplicate alongside the broker's copy.
//
// Removal is deliberately narrow: only holdings already marked
// `source: "webull"` and absent from `positions` are deleted. A holding the
// sync never created is never deleted, so a Webull-only view can't wipe out
// crypto/Thai/cash positions it simply has no knowledge of. Callers must
// only invoke this after a *successful* fetch — passing an empty array
// because a request failed would otherwise delete every mirrored holding.
export async function syncBrokerHoldings(
  uid: string,
  positions: BrokerPosition[],
  existing: Holding[],
  usdRate: number,
  portfolioId?: string | null
): Promise<HoldingSyncResult> {
  const result: HoldingSyncResult = { added: 0, updated: 0, removed: 0 };
  const seen = new Set<string>();

  for (const position of positions) {
    const symbol = position.symbol.toUpperCase();
    seen.add(symbol);
    // All matches, not just the first: a caller that ran this against a
    // not-yet-loaded holdings list once created duplicates, and collapsing
    // them here means the next successful sync repairs that automatically
    // instead of needing a one-off cleanup.
    const matches = existing
      .filter((h) => h.symbol.toUpperCase() === symbol)
      // Keep a hand-entered row over a mirrored one — it's the copy that may
      // carry transaction history — then order by id so the choice is stable
      // across runs rather than depending on query order.
      .sort((a, b) => {
        const aMirrored = a.source === "webull" ? 1 : 0;
        const bMirrored = b.source === "webull" ? 1 : 0;
        return aMirrored - bMirrored || a.id.localeCompare(b.id);
      });
    const match = matches[0];

    // Broker quotes are USD; holdings store THB with the USD cost kept
    // alongside. costPrice is already a true USD figure here, so avgCostUsd
    // is exact rather than back-derived through today's rate.
    const patch = {
      quantity: position.quantity,
      avgCost: position.costPrice * usdRate,
      avgCostUsd: position.costPrice,
      currentPrice: position.lastPrice * usdRate,
      livePrice: true,
      source: "webull" as const,
    };

    if (match) {
      await updateHolding(uid, match.id, patch);
      result.updated++;
      // Only ever drop the extra copies this sync itself could have made;
      // a second hand-entered row for the same symbol is the user's own data
      // and is left alone.
      for (const duplicate of matches.slice(1)) {
        if (duplicate.source !== "webull") continue;
        await deleteHolding(uid, duplicate.id);
        result.removed++;
      }
    } else {
      await addHolding(uid, {
        symbol,
        name: symbol,
        assetClass: "foreign_stock",
        ...patch,
        ...(portfolioId ? { portfolioId } : {}),
      });
      result.added++;
    }
  }

  for (const holding of existing) {
    if (holding.source !== "webull") continue;
    if (!BROKER_ASSET_CLASSES.has(holding.assetClass)) continue;
    if (seen.has(holding.symbol.toUpperCase())) continue;
    await deleteHolding(uid, holding.id);
    result.removed++;
  }

  return result;
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

// Broker order ids already imported, so a re-import over an overlapping date
// range skips them instead of creating duplicate transactions.
export async function getImportedOrderIds(
  uid: string,
  source: "webull"
): Promise<Set<string>> {
  const snap = await getDocs(
    query(userCollection(uid, "transactions"), where("source", "==", source))
  );
  const ids = new Set<string>();
  snap.forEach((d) => {
    const externalId = (d.data() as Transaction).externalId;
    if (externalId) ids.add(externalId);
  });
  return ids;
}

// ---- Dividends ----
export function watchDividends(uid: string, cb: (items: Dividend[]) => void) {
  return watchCollection<Dividend>(uid, "dividends", "paymentDate", cb);
}

export async function addDividend(uid: string, data: Omit<Dividend, "id">) {
  await addDoc(userCollection(uid, "dividends"), data);
}

export async function updateDividend(
  uid: string,
  id: string,
  data: Partial<Omit<Dividend, "id">>
) {
  await updateDoc(doc(db, "users", uid, "dividends", id), data);
}

export async function deleteDividend(uid: string, id: string) {
  await deleteDoc(doc(db, "users", uid, "dividends", id));
}

// ---- Price alerts (analysis page; levels in native quote currency) ----
export function watchPriceAlerts(uid: string, cb: (items: PriceAlert[]) => void) {
  const q = query(userCollection(uid, "priceAlerts"), orderBy("createdAtMs", "desc"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PriceAlert));
  });
}

export async function addPriceAlert(uid: string, data: Omit<PriceAlert, "id">) {
  await addDoc(userCollection(uid, "priceAlerts"), data);
}

export async function updatePriceAlert(
  uid: string,
  id: string,
  data: Partial<Omit<PriceAlert, "id">>
) {
  await updateDoc(doc(db, "users", uid, "priceAlerts", id), data);
}

export async function deletePriceAlert(uid: string, id: string) {
  await deleteDoc(doc(db, "users", uid, "priceAlerts", id));
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
//
// Also repairs a `costBasisPrice` that got corrupted to 0 (a bug in an
// earlier version of the edit form let this through) — priceFor() falls
// back to costBasisPrice whenever a live quote isn't loaded yet, so a
// zeroed cost basis prices the whole position at ฿0 despite a real coin
// balance. The original cost basis is unrecoverable once overwritten, so
// this re-prices at the current live rate as the best available fallback.
export async function migrateLegacyEarnPosition(
  uid: string,
  position: EarnPosition,
  priceMap: Record<string, number>
): Promise<void> {
  const raw = position as unknown as Record<string, unknown>;
  const price = priceMap[position.symbol];
  if (typeof raw.quantity === "number" && typeof raw.costBasisPrice === "number") {
    if (!(raw.costBasisPrice > 0) && price) {
      await updateEarnPosition(uid, position.id, { costBasisPrice: price });
    }
    return;
  }
  const legacyPrincipal = typeof raw.principal === "number" ? raw.principal : null;
  if (legacyPrincipal === null) return; // genuinely malformed, nothing to recover
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
function compound(quantity: number, apy: number, days: number): number {
  return quantity * Math.pow(1 + apy / 100 / 365, days);
}

// Coin quantity at any instant, including instants before the position's
// current `startDate` — which an edit moves forward, so "before startDate"
// is not the same as "before the deposit existed".
//
// Three cases, in order of accuracy:
//   1. On/after the current segment: compound the stored balance forward.
//   2. Inside a recorded prior segment: compound that segment's balance.
//   3. Before the current segment on a position edited before segments were
//      recorded: interpolate between the two anchors that ARE known —
//      depositQuantity at the original start, p.quantity at startDate —
//      using the compound rate those two imply rather than p.apy.
//
//      Both anchors have to be honoured or something visibly breaks. Using
//      p.apy from the deposit leaves a gap at startDate (depositQuantity was
//      derived at the edit's wall-clock instant, while startDate is that
//      day's midnight), and the whole discrepancy lands on the single day
//      before the edit — that day showed ~0.82 where its neighbours showed
//      ~0.96. Discounting p.quantity backwards instead is smooth but misses
//      depositQuantity, so the rows stop summing to the lifetime interest
//      figure, which uses it as the baseline. The implied rate absorbs the
//      inconsistency and satisfies both.
export function earnQuantityAt(p: EarnPosition, asOf: Date = new Date()): number {
  const origin = new Date(p.originalStartDate ?? p.startDate);
  if (asOf < origin) return 0; // genuinely before the deposit

  const effectiveStart = new Date(p.startDate);
  if (asOf >= effectiveStart) {
    return compound(p.quantity, p.apy, daysBetweenExact(effectiveStart, asOf));
  }

  for (const segment of [...(p.segments ?? [])].reverse()) {
    const segmentStart = new Date(segment.startDate);
    if (asOf >= segmentStart) {
      return compound(segment.quantity, segment.apy, daysBetweenExact(segmentStart, asOf));
    }
  }

  const deposit = p.depositQuantity ?? p.quantity;
  const spanDays = daysBetweenExact(origin, effectiveStart);
  if (spanDays <= 0 || deposit <= 0) return deposit;
  const impliedGrowthPerDay = Math.pow(p.quantity / deposit, 1 / spanDays);
  return deposit * Math.pow(impliedGrowthPerDay, daysBetweenExact(origin, asOf));
}

export function earnPositionQuantity(p: EarnPosition, asOf: Date = new Date()): number {
  return earnQuantityAt(p, asOf);
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

// THB value of just the interest credited so far (compounded quantity minus
// the original deposit), valued at today's price — deliberately excludes
// the coin's own price movement, unlike earnPositionValue's total PnL, so
// this is the number that actually answers "how much interest have I
// earned from Earn," independent of whether the coin itself went up or down.
// The baseline is depositQuantity (the true original deposit) when present:
// after an edit rebases the position, `quantity` includes interest accrued
// before the edit, and using it as the baseline would silently zero out the
// lifetime figure on every edit.
export function earnPositionInterestEarned(
  p: EarnPosition,
  priceMap: EarnPriceMap,
  asOf: Date = new Date()
): number {
  const interestQty = earnPositionQuantity(p, asOf) - (p.depositQuantity ?? p.quantity);
  return interestQty * priceFor(p, priceMap);
}

export interface DailyInterest {
  date: string; // YYYY-MM-DD
  coinInterest: number; // units of the coin itself credited that day
  thbInterest: number; // that day's coin interest valued at today's price
}

// Interest credited on each calendar day of the position's life, derived
// from the same compounding formula rather than a stored ledger.
//
// Each row spans that day's real calendar boundaries (midnight to midnight,
// UTC to match the ISO date used as the label), clamped to the deposit
// instant at the start and to `asOf` at the end. Rows used to span a rolling
// 24 hours measured back from the current time instead, which straddled two
// calendar dates each — so a row labelled "17 Jul" actually covered
// yesterday-afternoon through this-afternoon, and the first row showed only
// the few hours since midnight rather than a full day. Totals were right;
// the per-day attribution was not.
//
// The last row is deliberately partial: today isn't over, so it shows
// interest accrued so far. THB value uses today's price throughout since
// historical prices aren't available on the free tier this app runs on.
const MAX_DAILY_INTEREST_ROWS = 365;

export function computeDailyInterest(
  p: EarnPosition,
  priceMap: EarnPriceMap,
  days?: number,
  asOf: Date = new Date()
): DailyInterest[] {
  // Span from the ORIGINAL deposit date, not `startDate`: an edit rebases
  // the latter, and anchoring here used to drop every day before the most
  // recent edit from the list.
  const start = new Date(p.originalStartDate ?? p.startDate);
  if (asOf <= start) return [];
  // Default to the position's entire life, so an edit never appears to
  // truncate history. A fixed 14-day window did exactly that for anything
  // older than a fortnight. Capped so the list stays bounded.
  const lifetimeDays = Math.floor(daysBetweenExact(start, asOf)) + 1;
  const span = Math.min(days ?? Math.max(1, lifetimeDays), MAX_DAILY_INTEREST_ROWS);
  const price = priceFor(p, priceMap);
  const result: DailyInterest[] = [];

  for (let i = span - 1; i >= 0; i--) {
    const dayStart = new Date(asOf);
    dayStart.setUTCDate(dayStart.getUTCDate() - i);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEndBoundary = new Date(dayStart);
    dayEndBoundary.setUTCDate(dayEndBoundary.getUTCDate() + 1);

    // Clamp to the position's actual lifetime: the first day starts when the
    // deposit was made, and today ends now.
    const from = dayStart < start ? start : dayStart;
    const to = dayEndBoundary > asOf ? asOf : dayEndBoundary;
    if (to <= from) continue;

    const coinInterest = earnQuantityAt(p, to) - earnQuantityAt(p, from);
    result.push({
      date: dayStart.toISOString().slice(0, 10),
      coinInterest,
      thbInterest: coinInterest * price,
    });
  }
  return result;
}

export interface EarnSummary {
  totalValue: number;
  totalPrincipal: number;
  totalInterestEarned: number;
  totalInterestEarnedPct: number;
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
  // Principal = the true original deposits (see earnPositionInterestEarned
  // on why rebased `quantity` can't be the baseline).
  const totalPrincipal = positions.reduce(
    (s, p) => s + (p.depositQuantity ?? p.quantity) * p.costBasisPrice,
    0
  );
  const totalValue = positions.reduce((s, p) => s + earnPositionValue(p, priceMap, asOf), 0);
  const totalInterestEarned = positions.reduce(
    (s, p) => s + earnPositionInterestEarned(p, priceMap, asOf),
    0
  );
  const totalInterestEarnedPct = totalPrincipal > 0 ? (totalInterestEarned / totalPrincipal) * 100 : 0;

  const history: ValueSnapshot[] = [];
  if (positions.length > 0) {
    // Original start dates, so an edited position's chart still covers its
    // whole life rather than beginning at the edit.
    const startDateOf = (p: EarnPosition) => p.originalStartDate ?? p.startDate;
    const earliest = positions.reduce(
      (min, p) => (startDateOf(p) < min ? startDateOf(p) : min),
      startDateOf(positions[0])
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

  return { totalValue, totalPrincipal, totalInterestEarned, totalInterestEarnedPct, history };
}

export interface EarnGroup {
  symbol: string;
  apy: number; // taken from whichever position in the group is worth the most right now
  totalValue: number; // summed across every position sharing this symbol
  totalInterestEarned: number;
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
        totalInterestEarned: list.reduce((s, p) => s + earnPositionInterestEarned(p, priceMap, asOf), 0),
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
  // Privacy toggle: mask money amounts on the Dashboard (eye icon).
  hideDashboardAmounts?: boolean;
  // LINE Messaging API credentials for price alerts (user's own channel).
  lineToken?: string;
  lineUserId?: string;
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

// ---- Yearly investment plan (DCA budget split) ----
// One doc per Buddhist-era year, e.g. users/{uid}/investPlans/2569.
export async function getInvestPlan(uid: string, beYear: number): Promise<InvestPlan | null> {
  const snap = await getDoc(doc(db, "users", uid, "investPlans", String(beYear)));
  return snap.exists() ? (snap.data() as InvestPlan) : null;
}

export async function saveInvestPlan(uid: string, beYear: number, plan: InvestPlan) {
  await setDoc(doc(db, "users", uid, "investPlans", String(beYear)), {
    ...plan,
    updatedAtMs: Date.now(),
  });
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
  // Averaged from each transaction's entry-time priceUsd, so it stays a
  // fixed historical figure. 0 when no USD prices could be determined.
  avgCostUsd: number;
  lastPrice: number;
}

// Recomputed from the full transaction history for one symbol, so editing
// or deleting a past transaction always leaves quantity/avgCost consistent
// (rather than incrementally patching them at write time).
// `fallbackUsdRate` (THB per USD) approximates priceUsd for transactions
// saved before that field existed; without it, those transactions simply
// don't contribute to avgCostUsd.
export function computeHoldingStats(
  transactions: Transaction[],
  fallbackUsdRate?: number
): HoldingStats {
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  let quantity = 0;
  let costBasis = 0;
  let costBasisUsd = 0;
  let lastPrice = 0;
  for (const t of sorted) {
    if (t.type === "buy") {
      quantity += t.quantity;
      costBasis += t.quantity * t.price;
      const priceUsd =
        t.priceUsd && t.priceUsd > 0
          ? t.priceUsd
          : fallbackUsdRate
            ? t.price / fallbackUsdRate
            : 0;
      costBasisUsd += t.quantity * priceUsd;
      lastPrice = t.price;
    } else if (t.type === "sell") {
      const avgCost = quantity > 0 ? costBasis / quantity : 0;
      const avgCostUsd = quantity > 0 ? costBasisUsd / quantity : 0;
      quantity = Math.max(0, quantity - t.quantity);
      costBasis = quantity > 0 ? quantity * avgCost : 0;
      costBasisUsd = quantity > 0 ? quantity * avgCostUsd : 0;
      lastPrice = t.price;
    }
  }
  return {
    quantity,
    avgCost: quantity > 0 ? costBasis / quantity : 0,
    avgCostUsd: quantity > 0 ? costBasisUsd / quantity : 0,
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
