import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  DEGEN_SOLANA_BASKET,
  WSOL_MINT,
  type DegenSolanaMint,
} from "@/lib/degen-solana/constants";

export type MintBalance = {
  key: string;
  ticker: string;
  mint: string;
  decimals: number;
  ata: string;
  amount: bigint;
  uiAmount: number;
  ataExists: boolean;
};

export function connectionFromEnv(rpcUrl?: string): Connection {
  return new Connection(
    rpcUrl ||
      process.env.SOLANA_RPC_URL?.trim() ||
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() ||
      "https://api.mainnet-beta.solana.com",
    "confirmed",
  );
}

export async function readBasketBalances(params: {
  owner: string;
  connection?: Connection;
  basket?: readonly DegenSolanaMint[];
}): Promise<{ solLamports: bigint; tokens: MintBalance[] }> {
  const connection = params.connection ?? connectionFromEnv();
  const owner = new PublicKey(params.owner);
  const basket = params.basket ?? DEGEN_SOLANA_BASKET;
  const solLamports = BigInt(await connection.getBalance(owner, "confirmed"));

  const tokens: MintBalance[] = [];
  for (const m of basket) {
    const mint = new PublicKey(m.mint);
    const ata = getAssociatedTokenAddressSync(mint, owner, false);
    let amount = BigInt(0);
    let ataExists = false;
    try {
      const bal = await connection.getTokenAccountBalance(ata, "confirmed");
      amount = BigInt(bal.value.amount);
      ataExists = true;
    } catch {
      amount = BigInt(0);
      ataExists = false;
    }
    const uiAmount = Number(amount) / 10 ** m.decimals;
    tokens.push({
      key: m.key,
      ticker: m.ticker,
      mint: m.mint,
      decimals: m.decimals,
      ata: ata.toBase58(),
      amount,
      uiAmount,
      ataExists,
    });
  }

  return { solLamports, tokens };
}

export function dustThresholdRaw(decimals: number): bigint {
  // Skip tiny leftovers (~0.000001 of a unit scaled) — under 1000 raw units or 1e-6 of 1 token
  if (decimals <= 0) return BigInt(1);
  let pow = BigInt(1);
  const exp = Math.max(0, decimals - 6);
  for (let i = 0; i < exp; i += 1) pow *= BigInt(10);
  return pow;
}

export { WSOL_MINT };
