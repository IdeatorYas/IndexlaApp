/**
 * Deploy NEW CL executor + 5 adapters with decreaseLiquidityTo for partial % USDC exit,
 * reusing the live Safe-owned shared contracts (permission/strategy/fee/swap/oracle/mev/safety).
 *
 * Ownership of new Ownable executor → Safe. Adapters bind immutable executor.
 *
 * DOES NOT broadcast Safe config. Writes cutover artifact for MultiSend pack builder.
 *
 * Requires:
 *   BASE_RPC_URL, DEPLOYER_PRIVATE_KEY,
 *   STABLE_CLUB_BASE_DEPLOY_CONFIRMATION (exact phrase from guards)
 *
 *   npx hardhat run scripts/stable-club/deploy-exit-percent-cutover-create.cjs --network base
 */
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const guards = require("./base-mainnet-deploy-guards.cjs");

const CREATE_ARTIFACT = path.join(
  __dirname,
  "../../deployments/base-mainnet/safe-owned-stack-create.json",
);
const OUT = path.join(
  __dirname,
  "../../deployments/base-mainnet/exit-percent-cutover-create.json",
);

const SELECTORS = {
  exitAllToUsdc: "1cb72ffc",
  harvestAll: "b09e40c9",
  compoundAll: "9380b577",
};

async function main() {
  guards.assertConfirmationPhrase(process.env.STABLE_CLUB_BASE_DEPLOY_CONFIRMATION);
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  guards.assertBaseChainId(net.chainId);

  const live = JSON.parse(fs.readFileSync(CREATE_ARTIFACT, "utf8"));
  const shared = live.contracts;
  const SAFE = guards.MVP_SAFE;

  console.log(
    JSON.stringify({
      phase: "start",
      mode: "EXIT_PERCENT_CUTOVER_CREATE",
      deployer: deployer.address,
      safeOwner: SAFE,
      reuseSharedFrom: CREATE_ARTIFACT,
    }),
  );

  const ClExecutor = await ethers.getContractFactory(
    "StableClubConcentratedLiquidityExecutor",
  );
  const clExecutor = await ClExecutor.deploy(
    shared.permissionRegistry.address,
    shared.strategyRegistry.address,
    shared.feeRouter.address,
    shared.swapRouter.address,
    shared.mevGuard.address,
    shared.oracleGuard.address,
    shared.safetyController.address,
    guards.USDC,
  );
  await clExecutor.waitForDeployment();
  const clAddress = await clExecutor.getAddress();
  const clCreateTx = clExecutor.deploymentTransaction()?.hash ?? null;

  const code = await ethers.provider.getCode(clAddress);
  for (const [label, sel] of Object.entries(SELECTORS)) {
    if (!code.toLowerCase().includes(sel)) {
      throw new Error(`New CL executor missing ${label} selector 0x${sel}`);
    }
  }

  // decreaseLiquidityTo on adapters — probe after deploy
  const specs = guards.buildAdapterSpecs(clAddress);
  const adapters = [];
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
    const deployed = await factory.deploy(...args);
    await deployed.waitForDeployment();
    const address = await deployed.getAddress();
    const createTx = deployed.deploymentTransaction()?.hash ?? null;
    const adapterCode = await ethers.provider.getCode(address);
    // decreaseLiquidityTo(address,uint256,address,address,address,uint128,uint256,uint256)
    if (!adapterCode.toLowerCase().includes("0a43538a") && !adapterCode.toLowerCase().includes(
      require("ethers").id("decreaseLiquidityTo(address,uint256,address,address,address,uint128,uint256,uint256)").slice(2, 10)
    )) {
      throw new Error(`Adapter ${address} missing decreaseLiquidityTo selector`);
    }
    adapters.push({
      poolId: spec.poolId,
      protocol: spec.protocol,
      generation: spec.generation,
      adapter: address,
      poolAddress: spec.poolAddress,
      factory: spec.factory,
      npm: spec.npm,
      router: spec.router,
      tickSpacing: spec.tickSpacing ?? null,
      fee: spec.fee ?? null,
      tokenA: spec.tokenA,
      tokenB: spec.tokenB,
      createTx,
      constructorArgs: args,
    });
    console.log(JSON.stringify({ phase: "adapter", adapter: address, poolId: spec.poolId }));
  }

  const tx = await clExecutor.transferOwnership(SAFE);
  await tx.wait();
  console.log(JSON.stringify({ phase: "transferOwnership", clExecutor: clAddress, owner: SAFE, tx: tx.hash }));

  const out = {
    deployedAt: new Date().toISOString(),
    chainId: guards.BASE_CHAIN_ID,
    mode: "EXIT_PERCENT_CUTOVER_CREATE",
    note: "New CL executor + adapters with decreaseLiquidityTo. Shared registries reused. Existing strategies pin OLD adapters — users must full-exit old stack then register a new strategy with new adapters (strategy IDs non-recyclable).",
    deployer: deployer.address,
    safeOwner: SAFE,
    previousClExecutor: shared.clExecutor.address,
    previousAdapters: live.adapters.map((a) => a.adapter),
    sharedContracts: {
      permissionRegistry: shared.permissionRegistry.address,
      strategyRegistry: shared.strategyRegistry.address,
      feeRouter: shared.feeRouter.address,
      swapRouter: shared.swapRouter.address,
      oracleGuard: shared.oracleGuard.address,
      mevGuard: shared.mevGuard.address,
      safetyController: shared.safetyController.address,
    },
    contracts: {
      clExecutor: {
        address: clAddress,
        createTx: clCreateTx,
        owner: SAFE,
        ownershipTransferTx: tx.hash,
        constructorArgs: [
          shared.permissionRegistry.address,
          shared.strategyRegistry.address,
          shared.feeRouter.address,
          shared.swapRouter.address,
          shared.mevGuard.address,
          shared.oracleGuard.address,
          shared.safetyController.address,
          guards.USDC,
        ],
      },
    },
    adapters,
    selectors: SELECTORS,
    nextSteps: [
      "Build Safe MultiSend pack: node scripts/stable-club/build-exit-percent-cutover-pack.cjs",
      "Propose for Safe 2-of-3 review — do not enable features.exitPercentToUsdc until executed + E2E",
      "Verify on Basescan: npx hardhat run scripts/stable-club/verify-exit-percent-cutover.cjs --network base",
    ],
  };

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ wrote: OUT, clExecutor: clAddress }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
