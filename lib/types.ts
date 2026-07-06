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

const ASSET_CLASS_LABEL_EN: Record<AssetClass, string> = {
  th_stock: "Thai stocks",
  foreign_stock: "Foreign stocks",
  etf: "ETF",
  crypto: "Crypto",
  cash: "Cash",
};

export function assetClassLabel(assetClass: AssetClass, language: "th" | "en"): string {
  return language === "en" ? ASSET_CLASS_LABEL_EN[assetClass] : ASSET_CLASS_LABEL[assetClass];
}

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

const TRANSACTION_TYPE_LABEL: Record<TransactionType, Record<"th" | "en", string>> = {
  buy: { th: "ซื้อ", en: "Buy" },
  sell: { th: "ขาย", en: "Sell" },
  transfer: { th: "โอนเงิน", en: "Transfer" },
  dividend: { th: "รับปันผล", en: "Dividend" },
};

export function transactionTypeLabel(type: TransactionType, language: "th" | "en"): string {
  return TRANSACTION_TYPE_LABEL[type][language];
}

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
  // Present ("auto") on records created by the background sync from Yahoo
  // Finance's dividend history; absent on manually-entered records, so the
  // sync knows which rows it's allowed to overwrite on re-sync without
  // clobbering something the user typed in by hand.
  source?: "auto";
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
  quantity: number; // coin units deposited; interest compounds in this same coin
  costBasisPrice: number; // THB per unit at deposit time, for cost/gain display
  apy: number; // percent, e.g. 5.2
  startDate: string; // YYYY-MM-DD
}
