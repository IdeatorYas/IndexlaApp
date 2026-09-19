import { NextResponse } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  CALIBUR_RH,
  assertAllowlistedSellCalls,
  encodeCaliburSignedExecute,
  type BatchCall,
  type SignedBatchedCallMessage,
} from "@/lib/utility-index/sell-batch";
import { GATEWAY_ADDRESS, RH_CHAIN_ID, RH_RPC } from "@/lib/utility-index/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const robinhood = defineChain({
  id: RH_CHAIN_ID,
  name: "Robinhood",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RH_RPC] } },
});

type RelayBody = {
  user: Address;
  calls: BatchCall[];
  signedBatchedCall: {
    batchedCall: {
      calls: Array<{ to: Address; value: string; data: Hex }>;
      revertOnFailure: boolean;
    };
    nonce: string;
    keyHash: Hex;
    executor: Address;
    deadline: string;
  };
  wrappedSignature: Hex;
  authorization: {
    chainId: number | string;
    address: Address;
    nonce: number | string;
    yParity?: number;
    r: Hex;
    s: Hex;
  };
};

function readRelayerKey(): Hex | null {
  const raw = process.env.DEPLOYER_PRIVATE_KEY?.trim();
  if (!raw) return null;
  return (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
}

function reviveSignedBatchedCall(
  raw: RelayBody["signedBatchedCall"],
): SignedBatchedCallMessage {
  return {
    batchedCall: {
      calls: raw.batchedCall.calls.map((c) => ({
        to: c.to,
        value: BigInt(c.value),
        data: c.data,
      })),
      revertOnFailure: Boolean(raw.batchedCall.revertOnFailure),
    },
    nonce: BigInt(raw.nonce),
    keyHash: raw.keyHash,
    executor: raw.executor,
    deadline: BigInt(raw.deadline),
  };
}

export async function POST(req: Request) {
  try {
    const key = readRelayerKey();
    if (!key) {
      return NextResponse.json(
        { ok: false, error: "Relayer key not configured" },
        { status: 503 },
      );
    }

    const body = (await req.json()) as RelayBody;
    if (!body?.user || !body?.calls || !body?.signedBatchedCall || !body?.wrappedSignature || !body?.authorization) {
      return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });
    }

    assertAllowlistedSellCalls(body.calls, GATEWAY_ADDRESS);

    const message = reviveSignedBatchedCall(body.signedBatchedCall);
    // Ensure signed message calls match allowlisted request calls
    if (message.batchedCall.calls.length !== body.calls.length) {
      return NextResponse.json({ ok: false, error: "Call count mismatch" }, { status: 400 });
    }
    for (let i = 0; i < body.calls.length; i++) {
      const a = body.calls[i];
      const b = message.batchedCall.calls[i];
      if (
        a.to.toLowerCase() !== b.to.toLowerCase() ||
        a.data.toLowerCase() !== b.data.toLowerCase() ||
        BigInt(a.value) !== b.value
      ) {
        return NextResponse.json({ ok: false, error: `Call ${i} mismatch` }, { status: 400 });
      }
    }

    const authAddr = String(body.authorization.address).toLowerCase();
    if (authAddr !== CALIBUR_RH.toLowerCase()) {
      return NextResponse.json({ ok: false, error: "Authorization must target Calibur v10" }, { status: 400 });
    }

    const executeData = encodeCaliburSignedExecute(message, body.wrappedSignature);
    const account = privateKeyToAccount(key);
    const publicClient = createPublicClient({
      chain: robinhood,
      transport: http(RH_RPC),
    });
    const walletClient = createWalletClient({
      account,
      chain: robinhood,
      transport: http(RH_RPC),
    });

    const chainIdNum =
      typeof body.authorization.chainId === "string"
        ? Number.parseInt(body.authorization.chainId, 16) || Number(body.authorization.chainId)
        : Number(body.authorization.chainId);
    const authNonce =
      typeof body.authorization.nonce === "string"
        ? Number.parseInt(body.authorization.nonce, 16) || Number(body.authorization.nonce)
        : Number(body.authorization.nonce);

    const hash = await walletClient.sendTransaction({
      to: body.user,
      data: executeData,
      value: BigInt(0),
      chain: robinhood,
      account,
      authorizationList: [
        {
          address: CALIBUR_RH,
          chainId: chainIdNum || RH_CHAIN_ID,
          nonce: authNonce,
          yParity: body.authorization.yParity ?? 0,
          r: body.authorization.r,
          s: body.authorization.s,
        },
      ],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return NextResponse.json({
      ok: receipt.status === "success",
      hash,
      status: receipt.status,
      type: receipt.type,
      gasUsed: receipt.gasUsed.toString(),
      relayer: account.address,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: msg.slice(0, 400) },
      { status: 500 },
    );
  }
}
