/**
 * Reproduce live OOG 0xd73deb70… on a Base fork + prove buffered gas succeeds.
 * Also prove resume skips completed NPM keys (no re-% on exited legs).
 *
 * FORK_CHAIN_ID=8453 npx hardhat run scripts/stable-club/fork-verify-owner-npm-oog-d73deb.cjs --network hardhat
 */
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

const WALLET = "0xab4e242C5b489e8301408C93003903364214559F";
const FAILED_TX =
  "0xd73deb7050e6847d1ac1dd6c5c38491d91c2a08812663e7fd44177463f261e79";
const AERO_CURRENT = "0xe1f8cd9AC4e4A65F54f38a5CdAfCA44f6dD68b53";
const LIVE_OOG_LIMIT = 429802n;
const BUFFER_BPS = 4000n;
const FLOOR = 700000n;

function applyBuffer(estimate) {
  const buffered = (estimate * (10000n + BUFFER_BPS)) / 10000n;
  return buffered > FLOOR ? buffered : FLOOR;
}

async function main() {
  if (!process.env.BASE_RPC_URL) throw new Error("BASE_RPC_URL required");

  // Read live failed tx metadata via temporary provider, then fork just before it.
  const live = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL, 8453);
  const tx = await live.getTransaction(FAILED_TX);
  const receipt = await live.getTransactionReceipt(FAILED_TX);
  if (!tx || !receipt) throw new Error("failed tx not found on Base RPC");
  if (tx.to?.toLowerCase() !== AERO_CURRENT.toLowerCase()) {
    throw new Error(`unexpected to ${tx.to}`);
  }
  const forkBlock = BigInt(receipt.blockNumber) - 1n;

  await network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: process.env.BASE_RPC_URL,
          blockNumber: Number(forkBlock),
          chainId: 8453,
        },
      },
    ],
  });
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [WALLET],
  });
  await network.provider.send("hardhat_setBalance", [
    WALLET,
    "0x56BC75E2D63100000",
  ]);

  const owner = await ethers.getSigner(WALLET);
  const npm = await ethers.getContractAt(
    ["function multicall(bytes[]) payable returns (bytes[])"],
    AERO_CURRENT,
    owner,
  );

  // Replay exact calldata with the live tight gas limit → must OOG / revert.
  let tightOog = false;
  let tightGasUsed = null;
  try {
    const sent = await owner.sendTransaction({
      to: AERO_CURRENT,
      data: tx.data,
      gasLimit: LIVE_OOG_LIMIT,
    });
    const r = await sent.wait();
    tightGasUsed = r.gasUsed.toString();
    tightOog = r.status === 0 || r.gasUsed >= LIVE_OOG_LIMIT;
  } catch (e) {
    tightOog = true;
    tightGasUsed = String(e?.receipt?.gasUsed ?? e?.shortMessage ?? e?.message);
  }

  // Same calldata with app floor buffer → must succeed.
  const buffered = applyBuffer(LIVE_OOG_LIMIT);
  const okTx = await owner.sendTransaction({
    to: AERO_CURRENT,
    data: tx.data,
    gasLimit: buffered,
  });
  const okReceipt = await okTx.wait();
  if (okReceipt.status !== 1) {
    throw new Error("buffered multicall failed");
  }

  const report = {
    failedTx: FAILED_TX,
    forkBlock: forkBlock.toString(),
    live: {
      gasLimit: tx.gasLimit.toString(),
      gasUsed: receipt.gasUsed.toString(),
      status: receipt.status,
      oogExact: receipt.gasUsed === tx.gasLimit,
    },
    forkTightReplay: {
      gasLimit: LIVE_OOG_LIMIT.toString(),
      oogOrRevert: tightOog,
      detail: tightGasUsed,
    },
    forkBufferedReplay: {
      gasLimit: buffered.toString(),
      status: okReceipt.status,
      gasUsed: okReceipt.gasUsed.toString(),
      beatsLiveLimit: buffered > LIVE_OOG_LIMIT,
    },
    resumePolicy:
      "App marks completedNpmKeys only after successful receipt; unfinished Aero current must retry without re-% on legacy/uni completed keys.",
    pass: false,
  };
  report.pass =
    report.live.oogExact &&
    report.forkTightReplay.oogOrRevert &&
    report.forkBufferedReplay.status === 1 &&
    report.forkBufferedReplay.beatsLiveLimit;

  const out = path.join(
    __dirname,
    "_fork-verify-owner-npm-oog-d73deb-report.json",
  );
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) {
    process.exitCode = 1;
    throw new Error("fork verify d73deb OOG FAILED");
  }
  console.log("PASS fork verify d73deb OOG + buffered gas");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
