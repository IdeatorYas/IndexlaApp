/**
 * Estimate gas/ETH cost for EXIT_PERCENT cutover CREATE (no broadcast).
 *   node scripts/stable-club/estimate-exit-percent-cutover-create.cjs
 */
require("dotenv").config({ path: ".env.local" });
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const guards = require("./base-mainnet-deploy-guards.cjs");

const CREATE_ARTIFACT = path.join(
  __dirname,
  "../../deployments/base-mainnet/safe-owned-stack-create.json",
);

async function main() {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  guards.assertBaseChainId(net.chainId);

  const live = JSON.parse(fs.readFileSync(CREATE_ARTIFACT, "utf8"));
  const shared = live.contracts;
  const feeData = await ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? feeData.maxFeePerGas;
  if (!gasPrice) throw new Error("No gas price from RPC");

  const balance = await ethers.provider.getBalance(deployer.address);
  const ClExecutor = await ethers.getContractFactory(
    "StableClubConcentratedLiquidityExecutor",
  );
  const clArgs = [
    shared.permissionRegistry.address,
    shared.strategyRegistry.address,
    shared.feeRouter.address,
    shared.swapRouter.address,
    shared.mevGuard.address,
    shared.oracleGuard.address,
    shared.safetyController.address,
    guards.USDC,
  ];
  const clDeployTx = await ClExecutor.getDeployTransaction(...clArgs);
  const clGas = await ethers.provider.estimateGas({
    ...clDeployTx,
    from: deployer.address,
  });

  // Deploy a throwaway estimate against current bytecode sizes via factory estimate only.
  // Adapters need a non-zero executor address in constructor — use deployer as stand-in.
  const standInExecutor = deployer.address;
  const specs = guards.buildAdapterSpecs(standInExecutor);
  const adapterEstimates = [];
  let adapterGasTotal = 0n;

  for (const spec of specs) {
    let factory;
    let args;
    if (spec.protocol === "uniswap-v3") {
      factory = await ethers.getContractFactory("UniswapV3Adapter");
      args = [
        spec.executor,
        spec.poolId,
        spec.npm,
        spec.router,
        spec.poolAddress,
        spec.factory,
        spec.fee,
      ];
    } else {
      factory = await ethers.getContractFactory("AerodromeSlipstreamAdapter");
      args = [
        spec.executor,
        spec.poolId,
        spec.npm,
        spec.router,
        spec.poolAddress,
        spec.factory,
        spec.tickSpacing,
        ethers.ZeroAddress,
      ];
    }
    const tx = await factory.getDeployTransaction(...args);
    const gas = await ethers.provider.estimateGas({ ...tx, from: deployer.address });
    adapterGasTotal += gas;
    adapterEstimates.push({ poolId: spec.poolId, protocol: spec.protocol, gas: gas.toString() });
  }

  // Ownership transfer is a small fixed call; pad ~60k.
  const ownershipGas = 60_000n;
  const totalGas = clGas + adapterGasTotal + ownershipGas;
  // 20% buffer for base fee movement + constructor variance (real executor addr).
  const bufferedGas = (totalGas * 120n) / 100n;
  const costWei = bufferedGas * gasPrice;
  const costEth = ethers.formatEther(costWei);

  const report = {
    mode: "ESTIMATE_ONLY_NO_BROADCAST",
    chainId: Number(net.chainId),
    deployer: deployer.address,
    deployerBalanceEth: ethers.formatEther(balance),
    gasPriceGwei: ethers.formatUnits(gasPrice, "gwei"),
    estimates: {
      clExecutorGas: clGas.toString(),
      adapters: adapterEstimates,
      adapterGasTotal: adapterGasTotal.toString(),
      ownershipTransferGasPad: ownershipGas.toString(),
      totalGas: totalGas.toString(),
      bufferedGas20pct: bufferedGas.toString(),
      estimatedCostEth: costEth,
      estimatedCostWei: costWei.toString(),
      sufficientBalance: balance >= costWei,
    },
    note: "Adapter gas uses deployer as temporary executor stand-in; real CREATE uses new CL address (same bytecode size).",
  };

  console.log(JSON.stringify(report, null, 2));
  if (balance < costWei) {
    process.exitCode = 2;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
