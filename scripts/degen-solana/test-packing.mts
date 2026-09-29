/**
 * Cold-buy packing proof: quote 10 assets → pack ≤4 → report sizes.
 * Does not sign. Exit 0 only if all 10 fit in ≤4 packs under 1100B.
 */
import {
  DEGEN_SOLANA_BASKET,
  WSOL_MINT,
  DEFAULT_SLIPPAGE_BPS,
  BUY_CONFIRM_MAX,
} from "../../src/lib/degen-solana/constants.ts";
import { fetchJupiterQuote } from "../../src/lib/degen-solana/jupiter.ts";
import {
  PACK_SAFE_BYTES,
  packSwapLegs,
} from "../../src/lib/degen-solana/pack-swaps.ts";

async function main() {
  const owner =
    process.env.PROBE_OWNER || "BSGMRbK97DcgLe4u4kfNQnmTVZGVnwdtKQBJqWRBTZxU";
  const amountPer = BigInt(process.env.PROBE_LEG_LAMPORTS || "1460000");

  console.log("Fetching quotes for all 10 assets...");
  const legs = [];
  for (const m of DEGEN_SOLANA_BASKET) {
    const quote = await fetchJupiterQuote({
      inputMint: WSOL_MINT,
      outputMint: m.mint,
      amount: amountPer,
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
  console.log("Quotes fetched. Packing…");
  const res = await packSwapLegs({
    userPublicKey: owner,
    legs,
    side: "buy",
    closeEmptiedAtas: false,
  });

  console.log("Total packs:", res.packs.length);
  let allKeys = 0;
  for (let i = 0; i < res.packs.length; i++) {
    const p = res.packs[i]!;
    allKeys += p.keys.length;
    console.log(
      `Pack ${i}: [${p.tickers.join(", ")}] legs=${p.keys.length} size=${p.sizeBytes}B`,
    );
    if (p.sizeBytes > PACK_SAFE_BYTES) {
      throw new Error(`Pack ${i} exceeds safe bytes: ${p.sizeBytes}`);
    }
  }

  if (res.packs.length > BUY_CONFIRM_MAX) {
    throw new Error(
      `Too many packs: ${res.packs.length} > ${BUY_CONFIRM_MAX}`,
    );
  }
  if (allKeys !== 10) {
    throw new Error(`Expected 10 packed legs, got ${allKeys}`);
  }
  console.log(
    `PASS: cold buy would need ${res.packs.length} wallet confirmation(s) (≤${BUY_CONFIRM_MAX})`,
  );
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
