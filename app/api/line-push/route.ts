import { NextRequest } from "next/server";

// Relays a price-alert message to LINE via the Messaging API's push
// endpoint. Runs server-side purely to avoid CORS — the credentials are the
// user's own (their LINE Official Account channel token + their userId,
// configured in Settings), sent per-request and never stored here.
export async function POST(req: NextRequest) {
  let body: { token?: string; userId?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid body" }, { status: 400 });
  }
  const { token, userId, message } = body;
  if (!token || !userId || !message) {
    return Response.json({ ok: false, error: "missing token/userId/message" }, { status: 400 });
  }
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: userId,
        messages: [{ type: "text", text: message.slice(0, 4900) }],
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return Response.json({ ok: false, error: `LINE ${res.status}: ${detail.slice(0, 300)}` });
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, error: "network error" });
  }
}
