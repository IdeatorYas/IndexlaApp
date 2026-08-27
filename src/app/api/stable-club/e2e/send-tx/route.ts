import { NextResponse } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  STABLE_CLUB_LOCAL_CHAIN,
  STABLE_CLUB_LOCAL_RPC_URL,
} from "@/lib/stable-club/constants";

/** Hardhat account #0 — local E2E only; never used in production. */
const DEFAULT_E2E_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

function e2ePrivateKey(): Hex {
  const value = process.env.STABLE_CLUB_E2E_PRIVATE_KEY?.trim() ?? DEFAULT_E2E_PRIVATE_KEY;
  if (!/^0x[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error("Invalid STABLE_CLUB_E2E_PRIVATE_KEY");
  }
  return value as Hex;
}

type SendTxBody = {
  from?: Address;
  to?: Address;
  data?: Hex;
  value?: Hex;
  gas?: Hex;
};

export async function POST(request: Request) {
  if (process.env.STABLE_CLUB_E2E_SIGNING !== "true") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const tx = (await request.json()) as SendTxBody;
    const account = privateKeyToAccount(e2ePrivateKey());
  const transport = http(STABLE_CLUB_LOCAL_RPC_URL);
  const walletClient = createWalletClient({
    account,
    chain: STABLE_CLUB_LOCAL_CHAIN,
    transport,
  });
  const publicClient = createPublicClient({
    chain: STABLE_CLUB_LOCAL_CHAIN,
    transport,
  });

  const hash = await walletClient.sendTransaction({
    account,
    chain: STABLE_CLUB_LOCAL_CHAIN,
    to: tx.to,
    data: tx.data,
    value: tx.value ? BigInt(tx.value) : undefined,
    gas: tx.gas ? BigInt(tx.gas) : undefined,
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return NextResponse.json({ hash });
  } catch (error) {
    const message = error instanceof Error ? error.message : "send-tx failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
