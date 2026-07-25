import { NextRequest } from "next/server";
import {
  WebullError,
  fetchWebullAccounts,
  fetchWebullOrderHistory,
  webullConfigured,
} from "@/lib/webull";

// Returns the filled orders on the owner's Webull account so the client can
// turn them into transactions.
//
// Unlike /api/line-push — where the caller supplies their own LINE token —
// the Webull credentials live in this deployment's env and belong to one
// person. Signup is open, so without a check any signed-up user could read
// the owner's trading history through this route. Hence: the caller must
// present a valid Firebase ID token whose uid matches WEBULL_OWNER_UID.
//
// The token is verified against Google's Identity Toolkit rather than
// trusting a uid sent by the client (which anyone could forge). That avoids
// pulling in firebase-admin just for this one check.

const IDENTITY_LOOKUP = "https://identitytoolkit.googleapis.com/v1/accounts:lookup";

async function verifiedUid(idToken: string): Promise<string | null> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(`${IDENTITY_LOOKUP}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { users?: Array<{ localId?: string }> };
    return data.users?.[0]?.localId ?? null;
  } catch {
    return null;
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest) {
  if (!webullConfigured()) {
    return Response.json({ ok: false, error: "webull_not_configured" }, { status: 503 });
  }
  const ownerUid = process.env.WEBULL_OWNER_UID;
  if (!ownerUid) {
    // Fail closed: without a designated owner there is no way to tell who is
    // entitled to this data, so serve it to nobody.
    return Response.json({ ok: false, error: "owner_not_configured" }, { status: 503 });
  }

  let body: { idToken?: string; startDate?: string; endDate?: string; accountId?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const { idToken, startDate, endDate, accountId } = body;
  if (!idToken) return Response.json({ ok: false, error: "missing_token" }, { status: 401 });
  if (!startDate || !endDate || !DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
    return Response.json({ ok: false, error: "invalid_date_range" }, { status: 400 });
  }

  const uid = await verifiedUid(idToken);
  if (!uid) return Response.json({ ok: false, error: "invalid_token" }, { status: 401 });
  if (uid !== ownerUid) return Response.json({ ok: false, error: "forbidden" }, { status: 403 });

  try {
    let targetAccountId = accountId;
    if (!targetAccountId) {
      const accounts = await fetchWebullAccounts();
      if (!accounts.length) {
        return Response.json({ ok: false, error: "no_accounts" }, { status: 404 });
      }
      targetAccountId = accounts[0].accountId;
    }

    const orders = await fetchWebullOrderHistory({
      accountId: targetAccountId,
      startDate,
      endDate,
    });
    return Response.json({ ok: true, accountId: targetAccountId, orders });
  } catch (err) {
    const status = err instanceof WebullError ? err.status : 0;
    console.error("Webull order history failed", err);
    return Response.json(
      { ok: false, error: status === 403 ? "webull_forbidden" : "webull_request_failed" },
      { status: 502 }
    );
  }
}
