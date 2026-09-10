/**
 * Deploy Ops Gateway stack on Base: DepositLib → ExitLib → linked CL executor → Gateway.
 * Keeps gateway paused. Does NOT enable features.opsGateway in the app manifest.
 * Does NOT call setOpsGateway on live registry (bytecode has no such selector).
 *
 *   npx hardhat run scripts/stable-club/deploy-ops-gateway-create.cjs --network base
 *
 * Requires: BASE_RPC_URL, DEPLOYER_PRIVATE_KEY, STABLE_CLUB_BASE_DEPLOY_CONFIRMATION
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const guards = require("./base-mainnet-deploy-guards.cjs");
const {
  deployClExecutorLibraries,
  getClExecutorFactory,
} = require("./deploy-cl-executor.cjs");

const OUT = path.join(
  __dirname,
  "../../deployments/base-mainnet/ops-gateway-create.json",
);

/** Trusted live shared stack (from trusted-phase2a-base-manifest). */
const LIVE = {
  permissionRegistry: "0xF75423289baA42A44981533152c81E16f1aFa069",
  strategyRegistry: "0xf6696C45A1A186712c530696a5B392Ed9E18ae24",
  feeRouter: "0xf33239712875a7BD9d171cdD4d782c8FC022154C",
  swapRouter: "0x56c6c76B4d5997754988d3C26083af315BfFa98F",
  clExecutorLive: "0x455cc33194f82E253F41d91C1201eB4095c9D1Fa",
  oracleGuard: "0x0cD087927F590B28737dFd9c7AAeB73B8ede70Ba",
  mevGuard: "0xa524506a21a9a5105c535a45c55Fe5dF9970c540",
  safetyController: "0x429df0c70eEfCC5CD6b8B8FB94Ca8eDe226feDe5",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  usdc: guards.USDC,
  cbbtc: guards.CBBTC,
  weth: guards.WETH,
  adapters: [
    {
      poolId: "0xb51b99144079a80e7d705d0dbef80a3e5e0b55eba8199486dc8d3770c3c14c11",
      adapter: "0x426dF92067335e3B5Df01a8e0165Ac7BFCA27E8D",
    },
    {
      poolId: "0xa72adbe1cdd7bb579a7f6915e7a89382f5a6640b29420fca351c0e1324dfbfcd",
      adapter: "0x6d81BC4748483D61a16dDB9F44C2F4C98301e3ae",
    },
    {
      poolId: "0xab4b5c2fb326832537b899664425f8ea62c5385ea66ed996cfcb1a88471ed35f",
      adapter: "0x60DD0546b4816DAaEb864F1A3EbF3619D60646d3",
    },
    {
      poolId: "0x1749006c0f94a576f9ebaf7247b101875ca44fcc89e31ed9e52283a4d2e2e7db",
      adapter: "0x76C480a97589f4384E20d35F08436FA2758CE58b",
    },
    {
      poolId: "0xbce3446eaf96f286e047b7bed5939761058ea9d7ddcf21a40abb53a9d93a89af",
      adapter: "0x5831Dbc39a336e22A54F828fDcd3d75CfE26Ef1D",
    },
  ],
};

const UNI_NPM = "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1";
const AERO_NPM_CURRENT = "0x827922686190790b37229fd06084350e74485b72";
const AERO_NPM_LEGACY = "0xe1f8cd9AC4e4A65F54f38a5CdAfCA44f6dD68b53";
const UNI_SWAP_ROUTER_02 = "0x2626664c2603336E57B271c5C0b26F421741e481";
const TIMELOCK = "0x6A83733C829B6F8a9C0E0D4d5713D64eE959167a";
const SAFE = guards.MVP_SAFE;

async function waitCode(provider, address) {
  for (let i = 0; i < 10; i++) {
    const code = await provider.getCode(address);
    if (code && code !== "0x" && code.length > 10) return code;
    await new Promise((r) => setTimeout(r, 400 * (i + 1)));
  }
  throw new Error(`No bytecode at ${address}`);
}

async function main() {
  guards.assertConfirmationPhrase(process.env.STABLE_CLUB_BASE_DEPLOY_CONFIRMATION);
  const { ethers, network } = hre;
  if (network.name !== "base") {
    throw new Error(`Refuse deploy: network=${network.name} (need base)`);
  }
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  guards.assertBaseChainId(net.chainId);

  console.log(
    JSON.stringify({
      phase: "start",
      mode: "OPS_GATEWAY_CREATE",
      deployer: deployer.address,
      safe: SAFE,
      timelock: TIMELOCK,
      liveClExecutor: LIVE.clExecutorLive,
      liveStrategyRegistry: LIVE.strategyRegistry,
    }),
  );

  // 1–2 libs
  const libs = await deployClExecutorLibraries(ethers);
  console.log(JSON.stringify({ phase: "libs", ...libs }));

  // 3 linked executor
  const Factory = await getClExecutorFactory(ethers, libs);
  const clExecutor = await Factory.deploy(
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
  const newExecutor = await clExecutor.getAddress();
  const execTx = clExecutor.deploymentTransaction()?.hash ?? null;
  const execCode = await waitCode(ethers.provider, newExecutor);
  const execBytes = (execCode.length - 2) / 2;
  if (execBytes > 24576) {
    throw new Error(`New executor too large: ${execBytes}`);
  }
  console.log(
    JSON.stringify({
      phase: "executor",
      address: newExecutor,
      tx: execTx,
      deployedBytes: execBytes,
    }),
  );

  // Configure new executor (deployer is owner)
  await (await clExecutor.setPermit2(LIVE.permit2)).wait();
  for (const token of [LIVE.usdc, LIVE.cbbtc, LIVE.weth]) {
    await (await clExecutor.setTokenApproval(token, true)).wait();
  }
  // Register live primary adapters for future deposit cutover — calls will still
  // fail OnlyExecutor until adapters are redeployed with this executor immutable.
  for (const a of LIVE.adapters) {
    await (await clExecutor.setAdapterApproval(a.adapter, true)).wait();
    await (await clExecutor.registerPool(a.poolId, a.adapter)).wait();
  }
  // opsGateway left zero until Timelock/Safe activation
  console.log(JSON.stringify({ phase: "executor_configured", opsGateway: null }));

  // 4 gateway
  const Gateway = await ethers.getContractFactory("StableClubOpsGateway");
  const gateway = await Gateway.deploy(
    LIVE.strategyRegistry,
    newExecutor,
    LIVE.safetyController,
    LIVE.permit2,
    LIVE.usdc,
    UNI_SWAP_ROUTER_02,
  );
  await gateway.waitForDeployment();
  const gatewayAddr = await gateway.getAddress();
  const gwTx = gateway.deploymentTransaction()?.hash ?? null;
  await waitCode(ethers.provider, gatewayAddr);
  console.log(JSON.stringify({ phase: "gateway", address: gatewayAddr, tx: gwTx }));

  // Fail-closed: paused through Timelock window
  await (await gateway.setPaused(true)).wait();
  await (await gateway.setAllowedNpm(UNI_NPM, true)).wait();
  await (await gateway.setAllowedNpm(AERO_NPM_CURRENT, true)).wait();
  await (await gateway.setAllowedNpm(AERO_NPM_LEGACY, true)).wait();
  await (await gateway.setTrackedExitToken(LIVE.cbbtc, true)).wait();
  await (await gateway.setTrackedExitToken(LIVE.weth, true)).wait();
  await (await gateway.approveRouterForToken(LIVE.cbbtc)).wait();
  await (await gateway.approveRouterForToken(LIVE.weth)).wait();

  const paused = await gateway.paused();
  if (!paused) throw new Error("Gateway must remain paused after deploy");

  // Transfer ownership to Timelock so Safe→Timelock can unpause after 48h
  await (await clExecutor.transferOwnership(TIMELOCK)).wait();
  await (await gateway.transferOwnership(TIMELOCK)).wait();

  const artifact = {
    version: 1,
    chainId: 8453,
    network: "base",
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    governance: { safe: SAFE, timelock: TIMELOCK, delaySeconds: 172800 },
    libraries: libs,
    contracts: {
      clExecutorNew: newExecutor,
      clExecutorLive: LIVE.clExecutorLive,
      opsGateway: gatewayAddr,
      strategyRegistryLive: LIVE.strategyRegistry,
      permissionRegistryLive: LIVE.permissionRegistry,
      feeRouterLive: LIVE.feeRouter,
      swapRouterLive: LIVE.swapRouter,
      safetyControllerLive: LIVE.safetyController,
      permit2: LIVE.permit2,
      uniSwapRouter02: UNI_SWAP_ROUTER_02,
    },
    txs: { executor: execTx, gateway: gwTx },
    deployedBytes: { clExecutorNew: execBytes },
    compatibility: {
      liveRegistryHasSetOpsGateway: false,
      liveExecutorHasDepositFor: false,
      liveAdaptersBoundTo: LIVE.clExecutorLive,
      gatewayDepositBlockedUntil:
        "New StrategyPermissionRegistry (with opsGateway/WithSig) + adapters immutably bound to new executor",
      gatewayNpmWithdrawReadyWhenUnpaused: true,
      existingPositions:
        "User-owned NPM positions unchanged; gateway exit uses setApprovalForAll(gateway) on Uni/Aero NPMs only",
    },
    featureFlag: {
      opsGateway: false,
      paused: true,
      note: "Do not set features.opsGateway=true until Timelock unpause executes and Basescan verify completes",
    },
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(JSON.stringify({ phase: "done", artifact: OUT, ...artifact.contracts }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
