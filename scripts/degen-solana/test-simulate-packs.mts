/**
 * Pre-sign sim gate proof: pack all 10, simulate every pack, refuse on any err.
 * Models the client gate before the first Phantom prompt.
 */
import {
  DEGEN_SOLANA_BASKET,
  WSOL_MINT,
  DEFAULT_SLIPPAGE_BPS,
} from "../../src/lib/degen-solana/constants.ts";
import { fetchJupiterQuote } from "../../src/lib/degen-solana/jupiter.ts";
import { packSwapLegs } from "../../src/lib/degen-solana/pack-swaps.ts";
import { Connection, VersionedTransaction } from "@solana/web3.js";
import { solanaRpcUrl } from "../../src/lib/degen-solana/constants.ts";

async function main() {
  const owner =
    process.env.PROBE_OWNER || "BSGMRbK97DcgLe4u4kfNQnmTVZGVnwdtKQBJqWRBTZxU";
  const connection = new Connection(
    process.env.SOLANA_RPC_URL || solanaRpcUrl(),
    "confirmed",
  );
  const amountPer = BigInt(process.env.PROBE_LEG_LAMPORTS || "1460000");

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

  const res = await packSwapLegs({
    userPublicKey: owner,
    legs,
    side: "buy",
    closeEmptiedAtas: false,
  });
  console.log(`Packed into ${res.packs.length} tx(s). Simulating all…`);

  let failed = 0;
  for (let i = 0; i < res.packs.length; i++) {
    const p = res.packs[i]!;
    const tx = VersionedTransaction.deserialize(
      Buffer.from(p.swapTransaction, "base64"),
    );
    const latest = await connection.getLatestBlockhash("confirmed");
    (tx.message as { recentBlockhash: string }).recentBlockhash =
      latest.blockhash;
    const sim = await connection.simulateTransaction(tx, {
      sigVerify: false,
      replaceRecentBlockhash: true,
      commitment: "confirmed",
    });
    const err = sim.value.err;
    console.log(
      `Pack ${i} [${p.tickers.join("+")}] size=${p.sizeBytes} err=${JSON.stringify(err)} cu=${sim.value.unitsConsumed}`,
    );
    if (err) {
      failed += 1;
      console.log(`  FAIL named assets: ${p.tickers.join(", ")}`);
    }
  }

  if (failed > 0) {
    // For a funded cold wallet sims often fail on insufficient funds — that is
    // expected for an arbitrary probe owner. Report honestly.
    console.log(
      `SIM_SUMMARY: ${failed}/${res.packs.length} packs returned sim errors (may be funding-related for probe owner ${owner})`,
    );
    process.exit(2);
  }
  console.log(
    `PASS: all ${res.packs.length} packs simulate clean — would allow first wallet prompt`,
  );
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
