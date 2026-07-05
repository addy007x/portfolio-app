import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
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
  Goal,
  CashflowEntry,
  AssetClass,
} from "@/lib/types";
import { ASSET_CLASS_LABEL, ASSET_CLASS_COLOR } from "@/lib/types";

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

// ---- Goals ----
export function watchGoals(uid: string, cb: (items: Goal[]) => void) {
  return watchCollection<Goal>(uid, "goals", "name", cb);
}

export async function addGoal(uid: string, data: Omit<Goal, "id">) {
  await addDoc(userCollection(uid, "goals"), data);
}

export async function updateGoal(
  uid: string,
  id: string,
  data: Partial<Omit<Goal, "id">>
) {
  await updateDoc(doc(db, "users", uid, "goals", id), data);
}

export async function deleteGoal(uid: string, id: string) {
  await deleteDoc(doc(db, "users", uid, "goals", id));
}

// ---- Cashflow ----
export function watchCashflow(
  uid: string,
  cb: (items: CashflowEntry[]) => void
) {
  return watchCollection<CashflowEntry>(uid, "cashflowEntries", "month", cb);
}

export async function addCashflowEntry(
  uid: string,
  data: Omit<CashflowEntry, "id">
) {
  await addDoc(userCollection(uid, "cashflowEntries"), data);
}

export async function deleteCashflowEntry(uid: string, id: string) {
  await deleteDoc(doc(db, "users", uid, "cashflowEntries", id));
}

// ---- User profile ----
export interface UserProfile {
  name: string;
  email: string;
  currency: string;
  theme: string;
  language: string;
}

export async function updateUserProfile(
  uid: string,
  data: Partial<UserProfile>
) {
  await setDoc(doc(db, "users", uid), data, { merge: true });
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

export function buildInvestedHistory(transactions: Transaction[]): number[] {
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  let running = 0;
  const points: number[] = [];
  for (const t of sorted) {
    if (t.type === "buy") running += t.totalValue;
    else if (t.type === "sell") running -= t.totalValue;
    points.push(running);
  }
  return points;
}

export function computeAllocation(holdings: Holding[]): AllocationSlice[] {
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
      name: ASSET_CLASS_LABEL[assetClass],
      color: ASSET_CLASS_COLOR[assetClass],
      value,
      pct: total > 0 ? (value / total) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);
}
