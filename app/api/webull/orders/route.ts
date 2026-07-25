import { NextRequest } from "next/server";
import { WebullError, assertWebullOwner, fetchWebullAccounts, fetchWebullOrderHistory } from "@/lib/webull";

// Returns the filled orders on the owner's Webull account so the client can
// turn them into transactions. See lib/webull.ts's assertWebullOwner for why
// this is gated on a verified Firebase uid rather than open like /api/prices.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest) {
  let body: { idToken?: string; startDate?: string; endDate?: string; accountId?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const auth = await assertWebullOwner(body.idToken);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status });

  const { startDate, endDate, accountId } = body;
  if (!startDate || !endDate || !DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
    return Response.json({ ok: false, error: "invalid_date_range" }, { status: 400 });
  }

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
    // 401 here is almost always the access token (separate from the request
    // signature) being unapproved or past its ~15-day validity — that step
    // needs a human in the Webull mobile app, so it can't be auto-refreshed
    // in this request; the owner has to rerun the bootstrap.
    return Response.json(
      { ok: false, error: status === 401 ? "webull_token_expired" : "webull_request_failed" },
      { status: 502 }
    );
  }
}
