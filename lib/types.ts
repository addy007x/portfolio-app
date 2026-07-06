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
  // Absent on holdings created before multi-portfolio support; treated as
  // belonging to the account's defaultPortfolioId (see lib/portfolioContext).
  portfolioId?: string;
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
  portfolioId?: string;
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

export interface Portfolio {
  id: string;
  name: string;
  createdAtMs: number;
  targetAmount?: number; // THB, optional goal for this portfolio's total value
}

export interface ValueSnapshot {
  id: string;
  date: string; // YYYY-MM-DD, or a full ISO timestamp for math-generated series
  totalValue: number;
  // Present on Dashboard's stored daily snapshots; absent for Earn's
  // math-generated series which isn't portfolio-scoped.
  portfolioId?: string;
}

export interface EarnPosition {
  id: string;
  symbol: string;
  principal: number; // THB, amount deposited
  apy: number; // percent, e.g. 5.2
  startDate: string; // YYYY-MM-DD
}
