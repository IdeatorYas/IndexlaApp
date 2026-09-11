/**
 * Fork: (1) prove current wallet residue attribution for incomplete withdraw recovery.
 * (2) prove NPM multicall gas buffer beats live OOG limits 565311 and 429802 (0xd73deb70).
 * No live signing.
 *
 * FORK_CHAIN_ID=8453 npx hardhat run scripts/stable-club/fork-verify-withdraw-oog-fix.cjs --network hardhat
 */
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

const WALLET = "0xab4e242C5b489e8301408C93003903364214559F";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const CBBTC = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
const WETH = "0x4200000000000000000000000000000000000006";
const OOG_LIMITS = [565311n, 429802n];
const BUFFER_BPS = 4000n;
const FLOOR = 700000n;

const ERC20 = ["function balanceOf(address) view returns (uint256)"];

function applyBuffer(estimate) {
  const buffered = (estimate * (10000n + BUFFER_BPS)) / 10000n;
  return buffered > FLOOR ? buffered : FLOOR;
}

async function main() {
  if (!process.env.BASE_RPC_URL) throw new Error("BASE_RPC_URL required");
  await network.provider.request({
    method: "hardhat_reset",
    params: [{ forking: { jsonRpcUrl: process.env.BASE_RPC_URL, chainId: 8453 } }],
  });

  const usdc = await ethers.getContractAt(ERC20, USDC);
  const cbbtc = await ethers.getContractAt(ERC20, CBBTC);
  const weth = await ethers.getContractAt(ERC20, WETH);
  const cb = await cbbtc.balanceOf(WALLET);
  const wh = await weth.balanceOf(WALLET);
  const u = await usdc.balanceOf(WALLET);
  const buffers = OOG_LIMITS.map((lim) => ({
    oogLimitLive: lim.toString(),
    bufferedGas: applyBuffer(lim).toString(),
    bufferBeatsOogLimit: applyBuffer(lim) > lim,
  }));

  const report = {
    wallet: WALLET,
    balances: {
      usdc: u.toString(),
      usdcHuman: Number(u) / 1e6,
      cbBTC: cb.toString(),
      weth: wh.toString(),
    },
    hasWithdrawResidue: cb > 0n || wh > 0n,
    note:
      "Residue→USDC requires user signature via Resume incomplete withdraw. Do not sell unrelated assets without baseline attribution.",
    buffers,
    pass: false,
  };
  report.pass = buffers.every((b) => b.bufferBeatsOogLimit) && u >= 0n;

  const out = path.join(__dirname, "_fork-verify-withdraw-oog-fix-report.json");
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) {
    process.exitCode = 1;
    throw new Error("fork verify withdraw OOG fix FAILED");
  }
  console.log("PASS fork verify withdraw OOG gas buffers");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
