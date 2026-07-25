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
//
// A correct signature alone isn't enough to call anything, though: this
// account has token_check_enabled, so every request also needs an
// x-access-token. That token is issued via /openapi/auth/token/create and
// starts PENDING — it only becomes usable once a human approves it in the
// Webull mobile app (Messages > OpenAPI Notifications > Check Now, SMS
// code), a step Webull's own SDK just polls and waits for indefinitely.
// That can't happen inside a live web request, so this module does not
// attempt it: WEBULL_ACCESS_TOKEN/WEBULL_ACCESS_TOKEN_EXPIRES are bootstrapped
// out-of-band (see the scratchpad probe script) and just read here. The
// token is valid ~15 days after approval, then needs
// /openapi/auth/token/refresh (not yet wired up — re-run the bootstrap
// probe when fetchWebullAccounts/fetchWebullOrderHistory starts failing
// with WebullError "token_expired" or "token_not_configured").
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
  accessToken: string | null;
}

function readConfig(): WebullConfig | null {
  const appKey = process.env.WEBULL_APP_KEY;
  const appSecret = process.env.WEBULL_APP_SECRET;
  if (!appKey || !appSecret) return null;
  const region = (process.env.WEBULL_REGION ?? "th").toLowerCase();
  const host = process.env.WEBULL_HOST ?? REGION_HOSTS[region] ?? REGION_HOSTS.th;

  const expiresRaw = process.env.WEBULL_ACCESS_TOKEN_EXPIRES;
  const expires = expiresRaw ? Number(expiresRaw) : NaN;
  const tokenIsFresh = Number.isFinite(expires) && expires > Date.now();
  const accessToken = tokenIsFresh ? (process.env.WEBULL_ACCESS_TOKEN ?? null) : null;

  return { appKey, appSecret, host, accessToken };
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
  if (!cfg.accessToken) {
    // Every endpoint on this account requires x-access-token (config has
    // token_check_enabled=true); without it Webull returns a flat 401
    // INVALID_TOKEN regardless of how correct the signature is. There's no
    // way to obtain one here — see the module comment above.
    throw new WebullError(
      "Webull access token missing or expired — rerun the token bootstrap and update WEBULL_ACCESS_TOKEN",
      401
    );
  }

  const headers: Record<string, string> = {
    ...signHeaders(cfg, pathname, query, body),
    "x-version": version,
    "Content-Type": "application/json",
    "x-access-token": cfg.accessToken,
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

// Confirmed against a real account 2026-07-25 (see webull-openapi-findings
// memory): /openapi/trade/order/history returns an array of "combo"
// wrappers, each holding one or more actual orders:
//
//   [{ client_order_id, combo_type, orders: [{
//        symbol, side: "BUY"|"SELL", status: "FILLED"|..., order_id,
//        order_type, instrument_type, filled_quantity: "0.00254" (string,
//        fractional shares), filled_price: "1176.9656" (string, USD),
//        filled_time_at: "2026-07-20T14:37:43.949Z", time_in_force, ...
//     }] }, ...]
//
// Every combo observed held exactly one order, but the wrapper implies that
// isn't guaranteed (e.g. bracket/OCO orders), so this flattens rather than
// assuming a 1:1 shape.
interface RawWebullOrder {
  symbol?: unknown;
  side?: unknown;
  status?: unknown;
  order_id?: unknown;
  filled_quantity?: unknown;
  filled_price?: unknown;
  filled_time_at?: unknown;
}

function parseOrder(raw: RawWebullOrder): WebullOrder | null {
  if (typeof raw.status !== "string" || raw.status.toUpperCase() !== "FILLED") return null; // still open/cancelled orders moved no shares

  const symbol = typeof raw.symbol === "string" ? raw.symbol.toUpperCase() : null;
  const side =
    typeof raw.side === "string" && raw.side.toUpperCase() === "BUY"
      ? "buy"
      : typeof raw.side === "string" && raw.side.toUpperCase() === "SELL"
        ? "sell"
        : null;
  const quantity = firstFiniteNumber(raw as Record<string, unknown>, ["filled_quantity"]);
  const price = firstFiniteNumber(raw as Record<string, unknown>, ["filled_price"]);
  const filledAt =
    typeof raw.filled_time_at === "string" && !Number.isNaN(Date.parse(raw.filled_time_at))
      ? raw.filled_time_at.slice(0, 10)
      : null;
  const orderId = typeof raw.order_id === "string" ? raw.order_id : null;

  if (!symbol || !side || quantity === null || quantity <= 0 || price === null || !filledAt || !orderId) {
    return null;
  }
  return { orderId, symbol, side, quantity, price, filledAt };
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

  const combos: Array<{ orders?: RawWebullOrder[] }> = Array.isArray(payload)
    ? (payload as Array<{ orders?: RawWebullOrder[] }>)
    : [];

  const orders: WebullOrder[] = [];
  for (const combo of combos) {
    for (const raw of combo.orders ?? []) {
      const order = parseOrder(raw);
      if (order) orders.push(order);
    }
  }
  return orders;
}
