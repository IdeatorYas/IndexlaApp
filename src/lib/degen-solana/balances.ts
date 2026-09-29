import { Connection, PublicKey } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  DEGEN_SOLANA_BASKET,
  WSOL_MINT,
  solanaRpcUrl,
  type DegenSolanaMint,
} from "@/lib/degen-solana/constants";
import { createSolanaRpcFetch } from "@/lib/degen-solana/rpc-upstream";

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
  return new Connection(rpcUrl || solanaRpcUrl(), {
    commitment: "confirmed",
    fetch: createSolanaRpcFetch(),
    disableRetryOnRateLimit: true, // we own Retry-After / fallback
  });
}

/**
 * Basket balances in 2 RPC calls (getBalance + getParsedTokenAccountsByOwner)
 * instead of 1+10 sequential getTokenAccountBalance (which trips provider 429).
 */
export async function readBasketBalances(params: {
  owner: string;
  connection?: Connection;
  basket?: readonly DegenSolanaMint[];
}): Promise<{ solLamports: bigint; tokens: MintBalance[] }> {
  const connection = params.connection ?? connectionFromEnv();
  const owner = new PublicKey(params.owner);
  const basket = params.basket ?? DEGEN_SOLANA_BASKET;

  const [solLamportsNum, tokenResp] = await Promise.all([
    connection.getBalance(owner, "confirmed"),
    connection.getParsedTokenAccountsByOwner(
      owner,
      { programId: TOKEN_PROGRAM_ID },
      "confirmed",
    ),
  ]);
  const solLamports = BigInt(solLamportsNum);

  const byMint = new Map<string, { amount: bigint; ata: string }>();
  for (const { pubkey, account } of tokenResp.value) {
    const parsed = account.data.parsed as {
      info?: { mint?: string; tokenAmount?: { amount?: string } };
    };
    const mint = parsed?.info?.mint;
    const amountStr = parsed?.info?.tokenAmount?.amount;
    if (!mint || amountStr == null) continue;
    byMint.set(mint, { amount: BigInt(amountStr), ata: pubkey.toBase58() });
  }

  const tokens: MintBalance[] = basket.map((m) => {
    const ata = getAssociatedTokenAddressSync(
      new PublicKey(m.mint),
      owner,
      false,
    );
    const hit = byMint.get(m.mint);
    const amount = hit?.amount ?? BigInt(0);
    return {
      key: m.key,
      ticker: m.ticker,
      mint: m.mint,
      decimals: m.decimals,
      ata: hit?.ata ?? ata.toBase58(),
      amount,
      uiAmount: Number(amount) / 10 ** m.decimals,
      ataExists: Boolean(hit),
    };
  });

  return { solLamports, tokens };
}

export function dustThresholdRaw(decimals: number): bigint {
  if (decimals <= 0) return BigInt(1);
  let pow = BigInt(1);
  const exp = Math.max(0, decimals - 6);
  for (let i = 0; i < exp; i += 1) pow *= BigInt(10);
  return pow;
}

export { WSOL_MINT };
