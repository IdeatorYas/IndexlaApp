import {
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
} from "@solana/spl-token";
import {
  AddressLookupTableAccount,
  Connection,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  SOLANA_TX_MAX_BYTES,
  fetchJupiterSwapInstructions,
  type JupiterInstruction,
  type JupiterQuoteResponse,
} from "@/lib/degen-solana/jupiter";
import { connectionFromEnv } from "@/lib/degen-solana/balances";

/** Stay under packet limit with headroom for route drift. */
export const PACK_SAFE_BYTES = 1100;
export const PACK_PROMPT_MAX = 4;
export const PACK_LEGS_HINT_MAX = 3;

export type PackLegInput = {
  key: string;
  ticker: string;
  quote: JupiterQuoteResponse;
  feeAccount?: string;
};

export type PackedSwapTx = {
  keys: string[];
  tickers: string[];
  swapTransaction: string;
  blockhash: string;
  lastValidBlockHeight: number;
  sizeBytes: number;
};

function toInstruction(ix: JupiterInstruction): TransactionInstruction {
  return {
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map((a) => ({
      pubkey: new PublicKey(a.pubkey),
      isSigner: a.isSigner,
      isWritable: a.isWritable,
    })),
    data: Buffer.from(ix.data, "base64"),
  };
}

async function loadLookupTables(
  connection: Connection,
  addresses: string[],
): Promise<AddressLookupTableAccount[]> {
  const out: AddressLookupTableAccount[] = [];
  for (const addr of addresses) {
    const res = await connection.getAddressLookupTable(new PublicKey(addr));
    if (res.value) out.push(res.value);
  }
  return out;
}

type BuiltLeg = {
  key: string;
  ticker: string;
  amountIn: bigint;
  compute: TransactionInstruction[];
  /** Non-wrap setup (e.g. create output ATA). Wrap/unwrap handled once per pack. */
  setup: TransactionInstruction[];
  swap: TransactionInstruction;
  altAddresses: string[];
};

const WSOL = NATIVE_MINT.toBase58();

function isWrapRelatedSetup(
  ix: TransactionInstruction,
  owner: PublicKey,
): boolean {
  const wsolAta = getAssociatedTokenAddressSync(
    NATIVE_MINT,
    owner,
    false,
  ).toBase58();
  if (ix.programId.equals(SystemProgram.programId)) return true;
  // Any setup that touches WSOL mint or the user's WSOL ATA — we own wrap/close.
  return ix.keys.some(
    (k) => k.pubkey.toBase58() === wsolAta || k.pubkey.toBase58() === WSOL,
  );
}

async function fetchBuiltLeg(
  leg: PackLegInput,
  userPublicKey: string,
  owner: PublicKey,
): Promise<BuiltLeg> {
  const amountIn = BigInt(leg.quote.inAmount || "0");
  const inst = await fetchJupiterSwapInstructions({
    quoteResponse: leg.quote,
    userPublicKey,
    feeAccount: leg.feeAccount,
    // We wrap the pack total once ourselves.
    wrapAndUnwrapSol: false,
  });
  return {
    key: leg.key,
    ticker: leg.ticker,
    amountIn,
    compute: (inst.computeBudgetInstructions ?? []).map(toInstruction),
    setup: (inst.setupInstructions ?? [])
      .map(toInstruction)
      .filter((ix) => !isWrapRelatedSetup(ix, owner)),
    swap: toInstruction(inst.swapInstruction),
    altAddresses: inst.addressLookupTableAddresses ?? [],
  };
}

function composePack(
  owner: PublicKey,
  legs: BuiltLeg[],
  side: "buy" | "sell",
): TransactionInstruction[] {
  const ixs: TransactionInstruction[] = [];
  // Multi-leg packs need headroom beyond a single Jupiter CU estimate.
  ixs.push(
    ComputeBudgetProgram.setComputeUnitLimit({
      units: Math.min(1_400_000, 200_000 + legs.length * 350_000),
    }),
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 50_000,
    }),
  );

  // Ensure WSOL ATA exists for buy wrap and sell unwrap destination.
  const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, owner, false);
  ixs.push(
    createAssociatedTokenAccountIdempotentInstruction(
      owner,
      wsolAta,
      owner,
      NATIVE_MINT,
    ),
  );

  if (side === "buy") {
    const total = legs.reduce((a, l) => a + l.amountIn, BigInt(0));
    if (total > BigInt(0)) {
      ixs.push(
        SystemProgram.transfer({
          fromPubkey: owner,
          toPubkey: wsolAta,
          lamports: total,
        }),
        createSyncNativeInstruction(wsolAta),
      );
    }
  }

  const seen = new Set<string>();
  for (const leg of legs) {
    for (const ix of leg.setup) {
      const k = [
        ix.programId.toBase58(),
        ix.data.toString("base64"),
        ix.keys.map((x) => x.pubkey.toBase58()).join(","),
      ].join("|");
      if (seen.has(k)) continue;
      seen.add(k);
      ixs.push(ix);
    }
  }
  for (const leg of legs) ixs.push(leg.swap);

  // Return residual WSOL to native SOL.
  ixs.push(createCloseAccountInstruction(wsolAta, owner, owner));
  return ixs;
}

async function measureAndEncode(
  connection: Connection,
  payer: PublicKey,
  legs: BuiltLeg[],
  blockhash: string,
  side: "buy" | "sell",
): Promise<{ base64: string; size: number }> {
  const altAddrs = [...new Set(legs.flatMap((l) => l.altAddresses))];
  const alts = await loadLookupTables(connection, altAddrs);
  const msg = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions: composePack(payer, legs, side),
  }).compileToV0Message(alts);
  const raw = new VersionedTransaction(msg).serialize();
  return { base64: Buffer.from(raw).toString("base64"), size: raw.length };
}

/**
 * Pack Jupiter legs into ≤ PACK_PROMPT_MAX VersionedTransactions.
 * Buy packs: one wrap(total) → N swaps (wrapAndUnwrapSol:false) → one unwrap.
 * Each pack = one Phantom prompt.
 */
export async function packSwapLegs(params: {
  userPublicKey: string;
  legs: PackLegInput[];
  side?: "buy" | "sell";
  connection?: Connection;
  safeBytes?: number;
  promptMax?: number;
}): Promise<{ packs: PackedSwapTx[]; overflow: PackLegInput[] }> {
  if (params.legs.length === 0) return { packs: [], overflow: [] };

  const side = params.side ?? "buy";
  const connection = params.connection ?? connectionFromEnv();
  const safeBytes = params.safeBytes ?? PACK_SAFE_BYTES;
  const promptMax = params.promptMax ?? PACK_PROMPT_MAX;
  const payer = new PublicKey(params.userPublicKey);

  const built: BuiltLeg[] = [];
  for (const leg of params.legs) {
    built.push(await fetchBuiltLeg(leg, params.userPublicKey, payer));
  }

  const latest = await connection.getLatestBlockhash("confirmed");
  const groups: BuiltLeg[][] = [];
  let current: BuiltLeg[] = [];

  for (const leg of built) {
    const candidate = [...current, leg];
    let fits = candidate.length <= PACK_LEGS_HINT_MAX;
    if (fits) {
      const { size } = await measureAndEncode(
        connection,
        payer,
        candidate,
        latest.blockhash,
        side,
      );
      fits = size <= safeBytes;
    }
    if (fits) {
      current = candidate;
      continue;
    }
    if (current.length > 0) {
      groups.push(current);
      current = [];
    }
    const { size: alone } = await measureAndEncode(
      connection,
      payer,
      [leg],
      latest.blockhash,
      side,
    );
    if (alone > SOLANA_TX_MAX_BYTES) {
      throw new Error(
        `${leg.ticker} swap alone is ${alone} bytes (over packet limit)`,
      );
    }
    current = [leg];
  }
  if (current.length > 0) groups.push(current);

  const packs: PackedSwapTx[] = [];
  const overflowBuilt: BuiltLeg[] = [];
  for (const group of groups) {
    if (packs.length >= promptMax) {
      overflowBuilt.push(...group);
      continue;
    }
    const { base64, size } = await measureAndEncode(
      connection,
      payer,
      group,
      latest.blockhash,
      side,
    );
    packs.push({
      keys: group.map((g) => g.key),
      tickers: group.map((g) => g.ticker),
      swapTransaction: base64,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
      sizeBytes: size,
    });
  }

  const overflowKeys = new Set(overflowBuilt.map((b) => b.key));
  const overflow = params.legs.filter((l) => overflowKeys.has(l.key));
  return { packs, overflow };
}
