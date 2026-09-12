/**
 * List recent Base txs from the Stable Club wallet (read-only).
 * node scripts/stable-club/trace-wallet-recent-txs.cjs
 */
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const WALLET = "0xab4e242C5b489e8301408C93003903364214559F";
const LOOKBACK = Number(process.env.TX_LOOKBACK_BLOCKS || 400);

async function main() {
  const rpc = process.env.BASE_RPC_URL;
  if (!rpc) throw new Error("BASE_RPC_URL required");
  const p = new ethers.JsonRpcProvider(rpc, 8453);
  const w = WALLET.toLowerCase();
  const latest = await p.getBlockNumber();
  const found = [];
  for (let b = latest; b > latest - LOOKBACK && found.length < 40; b -= 1) {
    const block = await p.getBlock(b, true);
    if (!block?.prefetchedTransactions) continue;
    for (const tx of block.prefetchedTransactions) {
      if ((tx.from || "").toLowerCase() !== w) continue;
      const r = await p.getTransactionReceipt(tx.hash);
      found.push({
        hash: tx.hash,
        block: b,
        nonce: tx.nonce,
        to: (tx.to || "").toLowerCase(),
        gasLimit: tx.gasLimit?.toString(),
        gasUsed: r?.gasUsed?.toString(),
        status: r?.status,
        selector: (tx.data || "").slice(0, 10),
        oogExact:
          r &&
          tx.gasLimit != null &&
          r.gasUsed != null &&
          r.gasUsed === tx.gasLimit,
      });
    }
  }
  found.sort((a, b) => b.nonce - a.nonce);
  const out = {
    wallet: WALLET,
    latest,
    lookback: LOOKBACK,
    txs: found,
  };
  const file = path.join(__dirname, "_trace-wallet-recent-txs.json");
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
