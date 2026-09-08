/**
 * Resume EXIT_PERCENT cutover after CL executor CREATE succeeded but script
 * aborted before adapters / ownership transfer.
 *
 *   RESUME_CL_EXECUTOR=0x... npx hardhat run scripts/stable-club/resume-exit-percent-cutover-create.cjs --network base
 *
 * Requires STABLE_CLUB_BASE_DEPLOY_CONFIRMATION + DEPLOYER_PRIVATE_KEY.
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

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function getCodeRetry(provider, address) {
  let code = "0x";
  for (let attempt = 0; attempt < 8; attempt++) {
    code = await provider.getCode(address);
    if (code && code !== "0x" && code.length > 10) return code;
    await sleep(500 * (attempt + 1));
  }
  return code;
}

async function main() {
  guards.assertConfirmationPhrase(process.env.STABLE_CLUB_BASE_DEPLOY_CONFIRMATION);
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  guards.assertBaseChainId(net.chainId);

  const clAddress = ethers.getAddress(
    process.env.RESUME_CL_EXECUTOR?.trim() ||
      "0x455cc33194f82E253F41d91C1201eB4095c9D1Fa",
  );
  const live = JSON.parse(fs.readFileSync(CREATE_ARTIFACT, "utf8"));
  const shared = live.contracts;
  const SAFE = guards.MVP_SAFE;

  const code = await getCodeRetry(ethers.provider, clAddress);
  const exitSel = ethers
    .id(
      "exitAllToUsdc(bytes32,(uint8,address,address,address,uint256,uint128,uint256,uint256,uint256,bool)[5],(bytes32,uint256,uint256,uint256,uint256)[8],uint8,uint256,uint256)",
    )
    .slice(2, 10)
    .toLowerCase();
  if (!code.toLowerCase().includes(exitSel)) {
    throw new Error(`RESUME target ${clAddress} missing exitAllToUsdc`);
  }

  const clExecutor = await ethers.getContractAt(
    "StableClubConcentratedLiquidityExecutor",
    clAddress,
  );
  const owner = await clExecutor.owner();
  console.log(
    JSON.stringify({
      phase: "resume_start",
      clAddress,
      owner,
      deployer: deployer.address,
      safeOwner: SAFE,
    }),
  );

  const specs = guards.buildAdapterSpecs(clAddress);
  const adapters = [];
  for (const spec of specs) {
    await sleep(800); // stay under QuickNode 15 rps
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
    const adapterCode = await getCodeRetry(ethers.provider, address);
    const decSel = ethers
      .id(
        "decreaseLiquidityTo(address,uint256,address,address,address,uint128,uint256,uint256)",
      )
      .slice(2, 10)
      .toLowerCase();
    if (!adapterCode.toLowerCase().includes(decSel)) {
      throw new Error(`Adapter ${address} missing decreaseLiquidityTo`);
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

  let ownershipTransferTx = null;
  if (owner.toLowerCase() !== SAFE.toLowerCase()) {
    if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
      throw new Error(`Cannot transferOwnership: owner is ${owner}, not deployer`);
    }
    await sleep(800);
    const tx = await clExecutor.transferOwnership(SAFE);
    await tx.wait();
    ownershipTransferTx = tx.hash;
    console.log(
      JSON.stringify({
        phase: "transferOwnership",
        clExecutor: clAddress,
        owner: SAFE,
        tx: ownershipTransferTx,
      }),
    );
  } else {
    console.log(JSON.stringify({ phase: "ownership_already_safe", clExecutor: clAddress }));
  }

  const out = {
    deployedAt: new Date().toISOString(),
    chainId: guards.BASE_CHAIN_ID,
    mode: "EXIT_PERCENT_CUTOVER_CREATE",
    resumedFrom: clAddress,
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
        createTx: null,
        owner: SAFE,
        ownershipTransferTx,
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
    selectors: {
      exitAllToUsdc: exitSel,
      decreaseLiquidityTo: ethers
        .id(
          "decreaseLiquidityTo(address,uint256,address,address,address,uint128,uint256,uint256)",
        )
        .slice(2, 10),
    },
    nextSteps: [
      "Build Safe MultiSend pack: node scripts/stable-club/build-exit-percent-cutover-pack.cjs",
      "Propose for Safe 2-of-3: node scripts/stable-club/propose-exit-percent-cutover-multisend.cjs --broadcast",
      "Verify on Basescan after ETHERSCAN_API_KEY set",
    ],
  };

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ wrote: OUT, clExecutor: clAddress, adapterCount: adapters.length }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
