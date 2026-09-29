import {
  DEGEN_SOLANA_BASKET,
  WSOL_MINT,
  DEFAULT_SLIPPAGE_BPS,
} from "../../src/lib/degen-solana/constants.ts";
import { fetchJupiterQuote } from "../../src/lib/degen-solana/jupiter.ts";
import { packSwapLegs } from "../../src/lib/degen-solana/pack-swaps.ts";

async function main() {
  const owner = "BSGMRbK97DcgLe4u4kfNQnmTVZGVnwdtKQBJqWRBTZxU";
  const legs = [];
  for (const m of DEGEN_SOLANA_BASKET.slice(0, 4)) {
    const quote = await fetchJupiterQuote({
      inputMint: WSOL_MINT,
      outputMint: m.mint,
      amount: 1_460_000n,
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
  try {
    const res = await packSwapLegs({
      userPublicKey: owner,
      legs,
      side: "buy",
      promptMax: 1,
    });
    console.log("FAIL: expected throw, got packs=", res.packs.length);
    process.exit(1);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/Cannot fit/i.test(msg)) {
      console.log("FAIL: unexpected error:", msg);
      process.exit(1);
    }
    console.log("PASS failed-asset / overflow gate (0 prompts):", msg);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
