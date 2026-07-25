import { NextRequest } from "next/server";
import {
  WebullError,
  assertWebullOwner,
  fetchWebullAccounts,
  fetchWebullBalance,
  fetchWebullPositions,
} from "@/lib/webull";

// Read-only view of the owner's current Webull holdings + account totals.
// Uses /openapi/assets/* rather than the market-data API, so it works
// without the separate (paid) market-data subscription — confirmed
// 2026-07-25 against the real account. See lib/webull.ts's assertWebullOwner
// for the auth gate shared with /api/webull/orders.

export async function POST(req: NextRequest) {
  let body: { idToken?: string; accountId?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const auth = await assertWebullOwner(body.idToken);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status });

  try {
    let targetAccountId = body.accountId;
    if (!targetAccountId) {
      const accounts = await fetchWebullAccounts();
      if (!accounts.length) {
        return Response.json({ ok: false, error: "no_accounts" }, { status: 404 });
      }
      targetAccountId = accounts[0].accountId;
    }

    const [positions, balance] = await Promise.all([
      fetchWebullPositions(targetAccountId),
      fetchWebullBalance(targetAccountId),
    ]);
    return Response.json({ ok: true, accountId: targetAccountId, positions, balance });
  } catch (err) {
    const status = err instanceof WebullError ? err.status : 0;
    console.error("Webull positions failed", err);
    return Response.json(
      { ok: false, error: status === 401 ? "webull_token_expired" : "webull_request_failed" },
      { status: 502 }
    );
  }
}
