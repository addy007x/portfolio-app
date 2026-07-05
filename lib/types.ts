export type AssetClass =
  | "th_stock"
  | "foreign_stock"
  | "etf"
  | "crypto"
  | "cash";

export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  th_stock: "หุ้นไทย",
  foreign_stock: "หุ้นนอกประเทศ",
  etf: "ETF",
  crypto: "คริปโต",
  cash: "เงินสด",
};

export const ASSET_CLASS_COLOR: Record<AssetClass, string> = {
  th_stock: "var(--pal-th)",
  foreign_stock: "var(--pal-us)",
  etf: "var(--pal-etf)",
  crypto: "var(--pal-crypto)",
  cash: "var(--pal-cash)",
};

export const ASSET_CLASS_ICON: Record<AssetClass, string> = {
  th_stock: "trending_up",
  foreign_stock: "public",
  etf: "donut_small",
  crypto: "currency_bitcoin",
  cash: "account_balance_wallet",
};

export interface Holding {
  id: string;
  symbol: string;
  name: string;
  assetClass: AssetClass;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  iconUrl?: string;
  livePrice?: boolean;
  updatedAt?: unknown;
}

export type TransactionType = "buy" | "sell" | "transfer" | "dividend";

export interface Transaction {
  id: string;
  date: string; // ISO date
  type: TransactionType;
  holdingId?: string;
  symbol: string;
  quantity: number;
  price: number;
  totalValue: number;
  notes?: string;
  createdAt?: unknown;
}

export interface Dividend {
  id: string;
  holdingId?: string;
  symbol: string;
  exDate: string;
  paymentDate: string;
  amountPerShare: number;
  totalAmount: number;
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate?: string;
  icon: string;
}

export type CashflowType = "income" | "expense";

export interface CashflowEntry {
  id: string;
  month: string; // YYYY-MM
  category: string;
  type: CashflowType;
  amount: number;
}

export interface ValueSnapshot {
  id: string; // same as date, e.g. "2026-07-05"
  date: string; // YYYY-MM-DD
  totalValue: number;
}

export interface EarnPosition {
  id: string;
  symbol: string;
  principal: number; // THB, amount deposited
  apy: number; // percent, e.g. 5.2
  startDate: string; // YYYY-MM-DD
}
