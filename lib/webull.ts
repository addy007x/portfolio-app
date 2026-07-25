// Webull OpenAPI client — SERVER SIDE ONLY.
//
// The App Key/Secret here can place and cancel real orders through the
// Trading API, not just read data. They must never reach the browser, which
// is why the env vars deliberately have no NEXT_PUBLIC_ prefix and every
// entry point below asserts it isn't running in one.
//
// Scope: US stock quotes and the account's own order history. Webull's API
// has no Thai market — its Category enum covers only US/HK/CN and its
// trading Markets enum only US/HK/JP, so SET holdings keep using Yahoo's
// .BK listings (see app/api/prices/route.ts). The "th" region id refers to
// the account's home region, not a tradable market.
//
// Signing follows the official Python SDK's default_signature_composer.py.
// Note the published signature docs describe an older MD5 + HMAC-SHA1
// scheme whose worked example cannot be reproduced; the SDK hardcodes
// sha_hmac256_new, so SHA256 + HMAC-SHA256 is what the servers accept.
import crypto from "node:crypto";

const REGION_HOSTS: Record<string, string> = {
  th: "api.webull.co.th",
  us: "api.webull.com",
  hk: "api.webull.hk",
  jp: "api.webull.co.jp",
  sg: "api.webull.com.sg",
};

function assertServer() {
  if (typeof window !== "undefined") {
    throw new Error("lib/webull.ts is server-only: it holds order-placing credentials");
  }
}

interface WebullConfig {
  appKey: string;
  appSecret: string;
  host: string;
}

function readConfig(): WebullConfig | null {
  const appKey = process.env.WEBULL_APP_KEY;
  const appSecret = process.env.WEBULL_APP_SECRET;
  if (!appKey || !appSecret) return null;
  const region = (process.env.WEBULL_REGION ?? "th").toLowerCase();
  const host = process.env.WEBULL_HOST ?? REGION_HOSTS[region] ?? REGION_HOSTS.th;
  return { appKey, appSecret, host };
}

export function webullConfigured(): boolean {
  return readConfig() !== null;
}

// Python's quote(safe='') escapes everything outside [A-Za-z0-9_.-~];
// encodeURIComponent also leaves !*'() alone, so those need escaping too or
// the signature diverges for symbols/notes containing them.
function strictEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!*'()]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

function signHeaders(
  cfg: WebullConfig,
  pathname: string,
  query: Record<string, string>,
  body: unknown
): Record<string, string> {
  const headers: Record<string, string> = {
    "x-app-key": cfg.appKey,
    "x-timestamp": new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    "x-signature-version": "1.0",
    "x-signature-algorithm": "HMAC-SHA256",
    "x-signature-nonce": crypto.randomUUID(),
  };

  // Host is signed but sent by fetch itself rather than set explicitly.
  const signParams: Record<string, string> = { ...headers, host: cfg.host, ...query };
  const joined = Object.keys(signParams)
    .sort()
    .map((k) => `${k}=${signParams[k]}`)
    .join("&");

  let stringToSign = `${pathname}&${joined}`;
  if (body != null) {
    const digest = crypto.createHash("sha256").update(JSON.stringify(body), "utf8").digest("hex");
    stringToSign += `&${digest.toUpperCase()}`;
  }

  headers["x-signature"] = crypto
    .createHmac("sha256", cfg.appSecret + "&")
    .update(strictEncode(stringToSign), "utf8")
    .digest("base64");

  return headers;
}

export class WebullError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "WebullError";
  }
}

async function webullRequest<T>(
  pathname: string,
  query: Record<string, string> = {},
  { version = "v2", body = null as unknown, timeoutMs = 10_000 } = {}
): Promise<T> {
  assertServer();
  const cfg = readConfig();
  if (!cfg) throw new WebullError("Webull credentials are not configured", 0);

  const headers: Record<string, string> = {
    ...signHeaders(cfg, pathname, query, body),
    "x-version": version,
    "Content-Type": "application/json",
  };

  const qs = new URLSearchParams(query).toString();
  const url = `https://${cfg.host}${pathname}${qs ? `?${qs}` : ""}`;

  const res = await fetch(url, {
    method: body != null ? "POST" : "GET",
    headers,
    ...(body != null ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    // 403 here almost always means the account has no market-data
    // subscription rather than a broken signature — worth distinguishing
    // when this surfaces in logs.
    throw new WebullError(`Webull ${pathname} failed: ${res.status} ${detail}`, res.status);
  }
  return (await res.json()) as T;
}

// ---- Market data ----

function firstFiniteNumber(source: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const raw = source[key];
    const value = typeof raw === "string" ? parseFloat(raw) : raw;
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

// The snapshot response shape isn't published and the SDK just hands back
// raw JSON, so accept the plausible spellings rather than assuming one.
// `close` is last because on a snapshot it may be the previous session's
// close, which would be a stale answer whenever a live price exists.
const PRICE_KEYS = ["price", "last", "lastPrice", "last_price", "tradePrice", "close"];
const SYMBOL_KEYS = ["symbol", "ticker", "disSymbol"];

function extractQuotes(payload: unknown): Record<string, number> {
  const rows: Array<Record<string, unknown>> = Array.isArray(payload)
    ? (payload as Array<Record<string, unknown>>)
    : Array.isArray((payload as { data?: unknown })?.data)
      ? ((payload as { data: Array<Record<string, unknown>> }).data)
      : [];

  const out: Record<string, number> = {};
  for (const row of rows) {
    const symbol = SYMBOL_KEYS.map((k) => row[k]).find((v) => typeof v === "string") as
      | string
      | undefined;
    if (!symbol) continue;
    const price = firstFiniteNumber(row, PRICE_KEYS);
    if (price !== null) out[symbol.toUpperCase()] = price;
  }
  return out;
}

// Latest US stock/ETF prices in USD, keyed by symbol. Symbols Webull does
// not return are simply absent so callers can fall back per symbol.
export async function fetchWebullUsPrices(symbols: string[]): Promise<Record<string, number>> {
  if (!symbols.length) return {};
  const payload = await webullRequest<unknown>("/openapi/market-data/stock/snapshot", {
    symbols: symbols.join(","),
    category: "US_STOCK",
  });
  return extractQuotes(payload);
}

// ---- Account & order history ----

export interface WebullAccount {
  accountId: string;
  accountType?: string;
  currency?: string;
}

export async function fetchWebullAccounts(): Promise<WebullAccount[]> {
  const payload = await webullRequest<unknown>("/openapi/account/list");
  const rows: Array<Record<string, unknown>> = Array.isArray(payload)
    ? (payload as Array<Record<string, unknown>>)
    : Array.isArray((payload as { data?: unknown })?.data)
      ? ((payload as { data: Array<Record<string, unknown>> }).data)
      : [];
  return rows
    .map((row): WebullAccount | null => {
      const accountId = row.account_id ?? row.accountId ?? row.id;
      if (typeof accountId !== "string" && typeof accountId !== "number") return null;
      return {
        accountId: String(accountId),
        accountType: typeof row.account_type === "string" ? row.account_type : undefined,
        currency: typeof row.currency === "string" ? row.currency : undefined,
      };
    })
    .filter((a): a is WebullAccount => a !== null);
}

// One executed order, normalised to the fields the app's Transaction needs.
export interface WebullOrder {
  orderId: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number; // USD per share, average filled price
  filledAt: string; // ISO date (YYYY-MM-DD)
}

function parseFilledDate(row: Record<string, unknown>): string | null {
  const raw =
    row.filled_time ?? row.filledTime ?? row.updateTime ?? row.update_time ?? row.create_time;
  if (typeof raw === "number") return new Date(raw).toISOString().slice(0, 10);
  if (typeof raw === "string") {
    // Epoch millis sometimes arrive as a numeric string.
    const asNumber = Number(raw);
    const date = Number.isFinite(asNumber) && raw.trim() !== "" ? new Date(asNumber) : new Date(raw);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  return null;
}

// Only fully-filled orders become transactions — pending and cancelled ones
// never moved any shares, and importing them would corrupt cost basis.
function isFilled(row: Record<string, unknown>): boolean {
  const status = row.status ?? row.order_status ?? row.orderStatus;
  return typeof status === "string" && status.toUpperCase() === "FILLED";
}

export async function fetchWebullOrderHistory(args: {
  accountId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  pageSize?: number;
}): Promise<WebullOrder[]> {
  const payload = await webullRequest<unknown>("/openapi/trade/order/history", {
    account_id: args.accountId,
    start_date: args.startDate,
    end_date: args.endDate,
    page_size: String(args.pageSize ?? 100),
  });

  const rows: Array<Record<string, unknown>> = Array.isArray(payload)
    ? (payload as Array<Record<string, unknown>>)
    : Array.isArray((payload as { data?: unknown })?.data)
      ? ((payload as { data: Array<Record<string, unknown>> }).data)
      : [];

  const orders: WebullOrder[] = [];
  for (const row of rows) {
    if (!isFilled(row)) continue;

    const symbol = SYMBOL_KEYS.map((k) => row[k]).find((v) => typeof v === "string") as
      | string
      | undefined;
    const rawSide = row.side ?? row.order_side ?? row.action;
    const quantity = firstFiniteNumber(row, ["filled_quantity", "filledQuantity", "quantity"]);
    const price = firstFiniteNumber(row, [
      "avg_filled_price",
      "avgFilledPrice",
      "filled_price",
      "price",
    ]);
    const filledAt = parseFilledDate(row);
    const orderId = row.order_id ?? row.orderId ?? row.client_order_id;

    if (
      !symbol ||
      typeof rawSide !== "string" ||
      quantity === null ||
      quantity <= 0 ||
      price === null ||
      !filledAt ||
      (typeof orderId !== "string" && typeof orderId !== "number")
    ) {
      continue;
    }

    const side = rawSide.toUpperCase() === "BUY" ? "buy" : rawSide.toUpperCase() === "SELL" ? "sell" : null;
    if (!side) continue;

    orders.push({
      orderId: String(orderId),
      symbol: symbol.toUpperCase(),
      side,
      quantity,
      price,
      filledAt,
    });
  }
  return orders;
}
