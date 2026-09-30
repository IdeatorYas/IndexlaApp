/**
 * Full sell packing proof: quote sell legs → pack ≤3 WITHOUT token ATA closes.
 */
import {
  DEGEN_SOLANA_BASKET,
  WSOL_MINT,
  DEFAULT_SLIPPAGE_BPS,
  SELL_CONFIRM_MAX,
} from "../../src/lib/degen-solana/constants.ts";
import { fetchJupiterQuote } from "../../src/lib/degen-solana/jupiter.ts";
import {
  PACK_SAFE_BYTES,
  packSwapLegs,
} from "../../src/lib/degen-solana/pack-swaps.ts";

async function main() {
  const owner =
    process.env.PROBE_OWNER || "BSGMRbK97DcgLe4u4kfNQnmTVZGVnwdtKQBJqWRBTZxU";
  const sellRaw = BigInt(process.env.PROBE_SELL_RAW || "1000000");

  console.log("Fetching sell quotes for all 10 assets...");
  const legs = [];
  for (const m of DEGEN_SOLANA_BASKET) {
    const quote = await fetchJupiterQuote({
      inputMint: m.mint,
      outputMint: WSOL_MINT,
      amount: sellRaw,
      slippageBps: DEFAULT_SLIPPAGE_BPS,
      onlyDirectRoutes: true,
    });
    legs.push({
      key: m.key,
      ticker: m.ticker,
      mint: m.mint,
      quote,
    });
  }

  const res = await packSwapLegs({
    userPublicKey: owner,
    legs,
    side: "sell",
    closeEmptiedAtas: false,
    promptMax: SELL_CONFIRM_MAX,
  });

  console.log("Total sell packs:", res.packs.length);
  for (let i = 0; i < res.packs.length; i++) {
    const p = res.packs[i]!;
    console.log(
      `Pack ${i}: [${p.tickers.join(", ")}] legs=${p.keys.length} size=${p.sizeBytes}B`,
    );
    if (p.sizeBytes > PACK_SAFE_BYTES) {
      throw new Error(`Pack ${i} exceeds safe bytes`);
    }
  }

  if (res.packs.length > SELL_CONFIRM_MAX) {
    throw new Error(`Too many packs: ${res.packs.length}`);
  }
  const keys = res.packs.flatMap((p) => p.keys);
  if (keys.length !== 10) {
    throw new Error(`Expected 10 legs packed, got ${keys.length}`);
  }
  console.log(
    `PASS: full sell would need ${res.packs.length} wallet confirmation(s) (≤${SELL_CONFIRM_MAX})`,
  );
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
