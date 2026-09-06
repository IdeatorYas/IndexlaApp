#!/usr/bin/env node
/**
 * Deploy upgraded CL executor + 5 adapters for exitAllToUsdc cutover on Base.
 * Reuses live Timelock-owned registries/routers/guards from the trusted manifest.
 *
 * Does NOT:
 *  - move user funds
 *  - schedule Timelock ops (Safe 2-of-3)
 *  - pin features.exitAllToUsdc / enable deposits
 *
 * After success: transferOwnership(clExecutor → Timelock), then run
 * build-timelock-exit-usdc-ops.cjs --new-executor=… and propose Safe scheduleBatch.
 *
 * Requires: BASE_RPC_URL, DEPLOYER_PRIVATE_KEY, STABLE_CLUB_BASE_DEPLOY_CONFIRMATION
 */
require("dotenv").config({ path: ".env.local" });
const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");
const guards = require("./base-mainnet-deploy-guards.cjs");

const TIMELOCK = "0x6A83733C829B6F8a9C0E0D4d5713D64eE959167a";
const LIVE = {
  permissionRegistry: "0xe7b38db8B3910fd65486e33C684cEB5b0Cb56196",
  strategyRegistry: "0x6052FD15529B9d77aDd7F9C4b45804a7d07BEd83",
  feeRouter: "0x4660Fd35f6e856ED1a959d5261F0E8a132E8E39c",
  swapRouter: "0x46EbaC1c66f1A747084899b61a82Bf5A80E9C3F3",
  oracleGuard: "0x77a52E22df013D05dD8b3D758dfDED406FB8e73e",
  mevGuard: "0xA5c23ec5455f83Ea7db78c5Fb5c57fB528ECC3C4",
  safetyController: "0x7d561570da936a5726e233e6f2A7387B9997c9A1",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  usdc: guards.USDC,
  cbbtc: guards.CBBTC,
  weth: guards.WETH,
};

async function main() {
  guards.assertConfirmationPhrase(process.env.STABLE_CLUB_BASE_DEPLOY_CONFIRMATION);
  if (!process.env.DEPLOYER_PRIVATE_KEY?.trim()) {
    throw new Error("DEPLOYER_PRIVATE_KEY required");
  }
  if (!process.env.BASE_RPC_URL?.trim()) {
    throw new Error("BASE_RPC_URL required");
  }

  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  if (Number(net.chainId) !== 8453) {
    throw new Error(`Refuse non-Base chainId=${net.chainId}`);
  }

  console.log(JSON.stringify({ phase: "start", deployer: deployer.address, chainId: Number(net.chainId) }));

  const Cl = await ethers.getContractFactory("StableClubConcentratedLiquidityExecutor");
  const clExecutor = await Cl.deploy(
    LIVE.permissionRegistry,
    LIVE.strategyRegistry,
    LIVE.feeRouter,
    LIVE.swapRouter,
    LIVE.mevGuard,
    LIVE.oracleGuard,
    LIVE.safetyController,
    LIVE.usdc,
  );
  await clExecutor.waitForDeployment();
  const clAddr = await clExecutor.getAddress();
  console.log(JSON.stringify({ phase: "clExecutor", address: clAddr, tx: clExecutor.deploymentTransaction()?.hash }));

  const code = await ethers.provider.getCode(clAddr);
  const sel = ethers.id(
    "exitAllToUsdc(bytes32,(uint8,address,address,address,uint256,uint128,uint256,uint256,uint256,bool)[5],(bytes32,uint256,uint256,uint256,uint256)[8],uint8,uint256,uint256)",
  ).slice(2, 10);
  if (!code.toLowerCase().includes(sel)) {
    throw new Error("Deployed bytecode missing exitAllToUsdc selector");
  }

  let tx = await clExecutor.setPermit2(LIVE.permit2);
  await tx.wait();
  for (const token of [LIVE.usdc, LIVE.cbbtc, LIVE.weth]) {
    tx = await clExecutor.setTokenApproval(token, true);
    await tx.wait();
  }

  const specs = guards.buildAdapterSpecs(clAddr);
  const adapters = [];
  for (const spec of specs) {
    let adapter;
    if (spec.protocol === "uniswap-v3") {
      adapter = await ethers.deployContract("UniswapV3Adapter", [
        spec.executor,
        spec.poolId,
        spec.npm,
        spec.router,
        spec.poolAddress,
        spec.factory,
        spec.fee,
      ]);
    } else {
      adapter = await ethers.deployContract("AerodromeSlipstreamAdapter", [
        spec.executor,
        spec.poolId,
        spec.npm,
        spec.router,
        spec.poolAddress,
        spec.factory,
        spec.tickSpacing,
        ethers.ZeroAddress,
      ]);
    }
    await adapter.waitForDeployment();
    const adapterAddr = await adapter.getAddress();
    tx = await clExecutor.setAdapterApproval(adapterAddr, true);
    await tx.wait();
    tx = await clExecutor.registerPool(spec.poolId, adapterAddr);
    await tx.wait();
    adapters.push({
      poolId: spec.poolId,
      protocol: spec.protocol,
      adapter: adapterAddr,
      poolAddress: spec.poolAddress,
      deployTx: adapter.deploymentTransaction()?.hash,
    });
    console.log(JSON.stringify({ phase: "adapter", adapter: adapterAddr, poolId: spec.poolId }));
  }

  tx = await clExecutor.transferOwnership(TIMELOCK);
  const ownershipTx = await tx.wait();
  // Re-read after mining — some RPC endpoints briefly lag contract state.
  let owner = await clExecutor.owner();
  for (let i = 0; i < 5 && owner.toLowerCase() !== TIMELOCK.toLowerCase(); i++) {
    await new Promise((r) => setTimeout(r, 1500));
    owner = await clExecutor.owner();
  }
  if (owner.toLowerCase() !== TIMELOCK.toLowerCase()) {
    throw new Error(`Ownership transfer to Timelock failed (owner=${owner})`);
  }

  const out = {
    deployedAt: new Date().toISOString(),
    chainId: 8453,
    deployer: deployer.address,
    timelock: TIMELOCK,
    liveShared: LIVE,
    newClExecutor: clAddr,
    adapters,
    ownershipTransferTx: ownershipTx.hash,
    exitAllToUsdcSelector: `0x${sel}`,
    nextSteps: [
      "node scripts/stable-club/build-timelock-exit-usdc-ops.cjs --new-executor=" + clAddr,
      "Propose Safe→Timelock scheduleBatch (2-of-3)",
      "After execute (+48h): pin manifest features.exitAllToUsdc=true",
      "Never enable legacy exitAll in product UI",
    ],
  };

  const outDir = path.join(__dirname, "..", "..", "deployments", "base-mainnet");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "exit-usdc-cutover-executor.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ phase: "done", artifact: outPath, ...out }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
