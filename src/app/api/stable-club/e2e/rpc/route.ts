import { NextResponse } from "next/server";
import { STABLE_CLUB_LOCAL_RPC_URL } from "@/lib/stable-club/constants";

/** M7: E2E RPC proxy only when explicitly enabled on localhost (Playwright uses `next start`). */
function e2eAllowed(request: Request): boolean {
  if (process.env.STABLE_CLUB_E2E_SIGNING !== "true") return false;
  const host = (request.headers.get("host") ?? "").toLowerCase();
  return host.startsWith("localhost") || host.startsWith("127.0.0.1");
}

export async function POST(request: Request) {
  if (!e2eAllowed(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as { method: string; params?: unknown[] };
  const res = await fetch(STABLE_CLUB_LOCAL_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: body.method,
      params: body.params ?? [],
    }),
  });
  const json = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (json.error) {
    return NextResponse.json({ error: json.error.message }, { status: 500 });
  }
  return NextResponse.json({ result: json.result });
}
