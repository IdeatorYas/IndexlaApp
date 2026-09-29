import { NextResponse } from "next/server";
import { fetchSolanaJsonRpc } from "@/lib/degen-solana/rpc-upstream";

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
  "getAddressLookupTable",
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
 * 429/rate-limit: Retry-After + backoff + SOLANA_RPC_FALLBACK_URL.
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

  try {
    const result = await fetchSolanaJsonRpc({
      jsonrpc: "2.0",
      id: body.id ?? 1,
      method,
      params: body.params ?? [],
    });
    return new NextResponse(result.text, {
      status: result.status,
      headers: {
        "Content-Type": "application/json",
        "X-IndexLa-Rpc-Endpoint": String(result.endpointIndex),
      },
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
