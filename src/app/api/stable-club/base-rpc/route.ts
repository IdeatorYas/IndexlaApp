import { NextResponse } from "next/server";
import {
  resolveStableClubBaseUpstreamRpcUrls,
  STABLE_CLUB_BASE_RPC_ALLOWED_METHODS,
} from "@/lib/stable-club/base-rpc-server";

type JsonRpcBody = {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: unknown;
};

async function forwardToUpstream(
  upstream: string,
  payload: JsonRpcBody,
): Promise<Response> {
  return fetch(upstream, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: payload.id ?? 1,
      method: payload.method,
      params: payload.params ?? [],
    }),
    cache: "no-store",
  });
}

/**
 * Production Base JSON-RPC proxy — uses server BASE_RPC_URL (and fallbacks).
 * Read-only methods only; never exposes upstream URLs to the client.
 */
export async function POST(request: Request) {
  const upstreams = resolveStableClubBaseUpstreamRpcUrls();
  if (upstreams.length === 0) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32000, message: "Base RPC is not configured" },
      },
      { status: 503 },
    );
  }

  let body: JsonRpcBody;
  try {
    body = (await request.json()) as JsonRpcBody;
  } catch {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      },
      { status: 400 },
    );
  }

  const method = typeof body.method === "string" ? body.method : "";
  if (!STABLE_CLUB_BASE_RPC_ALLOWED_METHODS.has(method)) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: body.id ?? null,
        error: { code: -32601, message: `Method not allowed: ${method || "(missing)"}` },
      },
      { status: 405 },
    );
  }

  let lastStatus = 502;
  let lastText = "Upstream RPC unavailable";
  for (const upstream of upstreams) {
    try {
      const res = await forwardToUpstream(upstream, body);
      const text = await res.text();
      if (res.status === 429 || /rate.?limit|too many requests/i.test(text)) {
        lastStatus = 429;
        lastText = text;
        continue;
      }
      if (!res.ok) {
        lastStatus = res.status;
        lastText = text;
        continue;
      }
      return new NextResponse(text, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      lastStatus = 502;
      lastText = err instanceof Error ? err.message : "Upstream fetch failed";
    }
  }

  return NextResponse.json(
    {
      jsonrpc: "2.0",
      id: body.id ?? null,
      error: {
        code: -32005,
        message:
          lastStatus === 429
            ? "Rate limited by Base RPC — retry shortly"
            : lastText.slice(0, 200),
      },
    },
    { status: lastStatus === 429 ? 429 : 503 },
  );
}
