import { NextResponse } from "next/server";
import { solanaRpcUrl } from "@/lib/degen-solana/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Methods the browser Connection may call through this proxy. */
const ALLOWED = new Set([
  "getHealth",
  "getVersion",
  "getSlot",
  "getBlockHeight",
  "getLatestBlockhash",
  "getSignatureStatuses",
  "getSignatureStatus",
  "getTransaction",
  "getBalance",
  "getAccountInfo",
  "getMultipleAccounts",
  "getTokenAccountBalance",
  "getTokenAccountsByOwner",
  "getFeeForMessage",
  "simulateTransaction",
  "sendTransaction",
  "getEpochInfo",
  "isBlockhashValid",
]);

type JsonRpcBody = {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: unknown;
};

/**
 * Browser-facing Solana JSON-RPC proxy.
 * Public mainnet RPC rejects browser Origin with HTTP 403; Node upstream does not.
 */
export async function POST(request: Request) {
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
  if (!ALLOWED.has(method)) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: body.id ?? null,
        error: {
          code: -32601,
          message: `Method not allowed: ${method || "(missing)"}`,
        },
      },
      { status: 405 },
    );
  }

  const upstream = solanaRpcUrl();
  try {
    const res = await fetch(upstream, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: body.id ?? 1,
        method,
        params: body.params ?? [],
      }),
      cache: "no-store",
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: body.id ?? null,
        error: { code: -32000, message: msg },
      },
      { status: 502 },
    );
  }
}
