/**
 * Stateful Base-fork simulation of the full 18-call exit-percent MultiSend
 * (impersonate Safe as msg.sender). No mainnet broadcast.
 *
 *   npx hardhat run scripts/stable-club/simulate-exit-percent-cutover-fork.cjs --network hardhat
 *   (requires BASE_RPC_URL; script enables forking)
 */
require("dotenv").config({ path: ".env.local" });
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const SAFE = "0x356A4A432EE57F31F5cF8Fdd55F95c1FF6Cd5910";

async function main() {
  const rpc = process.env.BASE_RPC_URL?.trim();
  if (!rpc) throw new Error("BASE_RPC_URL required");

  await hre.network.provider.request({
    method: "hardhat_reset",
    params: [{ forking: { jsonRpcUrl: rpc } }],
  });

  const { ethers } = hre;
  const pack = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "deployments/base-mainnet/exit-percent-cutover-approval-pack.json"),
      "utf8",
    ),
  );

  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [SAFE],
  });
  await hre.network.provider.send("hardhat_setBalance", [
    SAFE,
    "0x56BC75E2D63100000", // 100 ETH
  ]);
  const safe = await ethers.getSigner(SAFE);

  const results = [];
  for (const [i, tx] of pack.safeTransactions.entries()) {
    try {
      const sent = await safe.sendTransaction({
        to: tx.to,
        data: tx.data,
        value: 0n,
        gasLimit: 2_000_000n,
      });
      const receipt = await sent.wait();
      results.push({
        index: i,
        label: tx.label,
        to: tx.to,
        method: tx.decoded?.method,
        args: tx.decoded?.args,
        ok: receipt.status === 1,
        gasUsed: receipt.gasUsed.toString(),
        txHash: receipt.hash,
      });
    } catch (e) {
      results.push({
        index: i,
        label: tx.label,
        to: tx.to,
        method: tx.decoded?.method,
        args: tx.decoded?.args,
        ok: false,
        error: String(e.shortMessage || e.message || e).slice(0, 500),
      });
      break;
    }
  }

  // Post-state checks on new executor
  const cl = await ethers.getContractAt(
    [
      "function permit2() view returns (address)",
      "function approvedTokens(address) view returns (bool)",
      "function approvedAdapters(address) view returns (bool)",
      "function poolAdapters(bytes32) view returns (address)",
      "function owner() view returns (address)",
    ],
    pack.addresses.newClExecutor,
  );
  const post = {
    owner: await cl.owner(),
    permit2: await cl.permit2(),
    tokens: {
      USDC: await cl.approvedTokens("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"),
      cbBTC: await cl.approvedTokens("0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf"),
      WETH: await cl.approvedTokens("0x4200000000000000000000000000000000000006"),
    },
    pools: [],
  };
  for (const a of pack.addresses.adapters) {
    post.pools.push({
      poolId: a.poolId,
      expectedAdapter: a.adapter,
      registered: await cl.poolAdapters(a.poolId),
      adapterApproved: await cl.approvedAdapters(a.adapter),
      match:
        (await cl.poolAdapters(a.poolId)).toLowerCase() === a.adapter.toLowerCase(),
    });
  }

  const out = {
    mode: "BASE_FORK_STATEFUL_SEQUENTIAL",
    note: "Mirrors MultiSend Call semantics (msg.sender=Safe). Isolated eth_call of registerPool alone reverts until prior setAdapterApproval in same state.",
    allOk: results.length === pack.safeTransactions.length && results.every((r) => r.ok),
    executedCount: results.filter((r) => r.ok).length,
    results,
    post,
  };

  const outPath = path.join(
    process.cwd(),
    "deployments/base-mainnet/exit-percent-cutover-fork-simulation.json",
  );
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  if (!out.allOk) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
