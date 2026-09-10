/**
 * Deploy deposit-matched Ops Gateway stack on Base:
 *   StrategyPermissionRegistry (with setOpsGateway) → linked CL executor →
 *   5 adapters bound to that executor → StableClubOpsGateway (paused).
 *
 * Reuses DepositLib/ExitLib from ops-gateway-create.json when present.
 * Does NOT touch the live strategy registry / live CL executor / live adapters.
 * Does NOT enable app feature flags. Ownership → Timelock.
 *
 * Safe Multisend (later, Safe-owned live PermissionRegistry/FeeRouter/SwapRouter):
 *   setStrategyRegistrar(newRegistry), setOperator(newExecutor), setOperator(newRegistry),
 *   feeRouter/swapRouter setExecutorApproved(newExecutor).
 *
 *   npx hardhat run scripts/stable-club/deploy-ops-gateway-deposit-stack.cjs --network base
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const guards = require("./base-mainnet-deploy-guards.cjs");
const {
  deployClExecutorLibraries,
  getClExecutorFactory,
} = require("./deploy-cl-executor.cjs");

const CREATE_ART = path.join(
  __dirname,
  "../../deployments/base-mainnet/ops-gateway-create.json",
);
const CUTOVER_ART = path.join(
  __dirname,
  "../../deployments/base-mainnet/exit-percent-cutover-create.json",
);
const OUT = path.join(
  __dirname,
  "../../deployments/base-mainnet/ops-gateway-deposit-stack.json",
);

const LIVE = {
  permissionRegistry: "0xF75423289baA42A44981533152c81E16f1aFa069",
  feeRouter: "0xf33239712875a7BD9d171cdD4d782c8FC022154C",
  swapRouter: "0x56c6c76B4d5997754988d3C26083af315BfFa98F",
  oracleGuard: "0x0cD087927F590B28737dFd9c7AAeB73B8ede70Ba",
  mevGuard: "0xa524506a21a9a5105c535a45c55Fe5dF9970c540",
  safetyController: "0x429df0c70eEfCC5CD6b8B8FB94Ca8eDe226feDe5",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  usdc: guards.USDC,
  cbbtc: guards.CBBTC,
  weth: guards.WETH,
  clExecutorLive: "0x455cc33194f82E253F41d91C1201eB4095c9D1Fa",
  strategyRegistryLive: "0xf6696C45A1A186712c530696a5B392Ed9E18ae24",
  withdrawGateway: "0xAa0a7383F15bE490388bcF2793714e59b5063a8b",
};

const STRATEGY_KIND =
  "0x6aa596a46004a6b2f72b8c68391496a8652d1d0b070918ccb9752fba243846c3";
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

function loadAdapterSpecs(executor) {
  const cut = JSON.parse(fs.readFileSync(CUTOVER_ART, "utf8"));
  return cut.adapters.map((a) => {
    const args = [...a.constructorArgs];
    args[0] = executor; // rebind immutable executor
    return {
      poolId: a.poolId,
      protocol: a.protocol,
      generation: a.generation,
      constructorArgs: args,
      poolAddress: a.poolAddress,
      factory: a.factory,
      npm: a.npm,
      router: a.router,
      tickSpacing: a.tickSpacing,
      fee: a.fee,
      tokenA: a.tokenA,
      tokenB: a.tokenB,
    };
  });
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

  let libs;
  if (fs.existsSync(CREATE_ART)) {
    const create = JSON.parse(fs.readFileSync(CREATE_ART, "utf8"));
    libs = create.libraries;
    console.log(JSON.stringify({ phase: "reuse_libs", ...libs }));
  } else {
    libs = await deployClExecutorLibraries(ethers);
    console.log(JSON.stringify({ phase: "libs", ...libs }));
  }

  const Registry = await ethers.getContractFactory("StrategyPermissionRegistry");
  const strategyRegistry = await Registry.deploy(
    LIVE.permissionRegistry,
    STRATEGY_KIND,
    LIVE.usdc,
  );
  await strategyRegistry.waitForDeployment();
  const registryAddr = await strategyRegistry.getAddress();
  await waitCode(ethers.provider, registryAddr);
  console.log(JSON.stringify({ phase: "registry", address: registryAddr }));

  const Factory = await getClExecutorFactory(ethers, libs);
  const ctorArgs = [
    LIVE.permissionRegistry,
    registryAddr,
    LIVE.feeRouter,
    LIVE.swapRouter,
    LIVE.mevGuard,
    LIVE.oracleGuard,
    LIVE.safetyController,
    LIVE.usdc,
  ];
  const clExecutor = await Factory.deploy(...ctorArgs);
  await clExecutor.waitForDeployment();
  const execAddr = await clExecutor.getAddress();
  const execCode = await waitCode(ethers.provider, execAddr);
  const execBytes = (execCode.length - 2) / 2;
  if (execBytes > 24576) throw new Error(`Deposit executor too large: ${execBytes}`);
  console.log(JSON.stringify({ phase: "executor", address: execAddr, deployedBytes: execBytes }));

  await (await clExecutor.setPermit2(LIVE.permit2)).wait();
  for (const token of [LIVE.usdc, LIVE.cbbtc, LIVE.weth]) {
    await (await clExecutor.setTokenApproval(token, true)).wait();
  }

  const specs = loadAdapterSpecs(execAddr);
  const adapters = [];
  for (const spec of specs) {
    const name =
      spec.protocol === "uniswap-v3" ? "UniswapV3Adapter" : "AerodromeSlipstreamAdapter";
    const F = await ethers.getContractFactory(name);
    const adapter = await F.deploy(...spec.constructorArgs);
    await adapter.waitForDeployment();
    const adapterAddr = await adapter.getAddress();
    await waitCode(ethers.provider, adapterAddr);
    await (await clExecutor.setAdapterApproval(adapterAddr, true)).wait();
    await (await clExecutor.registerPool(spec.poolId, adapterAddr)).wait();
    adapters.push({
      ...spec,
      adapter: adapterAddr,
      createTx: adapter.deploymentTransaction()?.hash ?? null,
    });
    console.log(JSON.stringify({ phase: "adapter", protocol: spec.protocol, adapter: adapterAddr }));
  }

  const Gateway = await ethers.getContractFactory("StableClubOpsGateway");
  const gwCtor = [
    registryAddr,
    execAddr,
    LIVE.safetyController,
    LIVE.permit2,
    LIVE.usdc,
    UNI_SWAP_ROUTER_02,
  ];
  const gateway = await Gateway.deploy(...gwCtor);
  await gateway.waitForDeployment();
  const gatewayAddr = await gateway.getAddress();
  await waitCode(ethers.provider, gatewayAddr);
  console.log(JSON.stringify({ phase: "gateway", address: gatewayAddr }));

  await (await gateway.setPaused(true)).wait();
  await (await gateway.setAllowedNpm(UNI_NPM, true)).wait();
  await (await gateway.setAllowedNpm(AERO_NPM_CURRENT, true)).wait();
  await (await gateway.setAllowedNpm(AERO_NPM_LEGACY, true)).wait();
  await (await gateway.setTrackedExitToken(LIVE.cbbtc, true)).wait();
  await (await gateway.setTrackedExitToken(LIVE.weth, true)).wait();
  await (await gateway.approveRouterForToken(LIVE.cbbtc)).wait();
  await (await gateway.approveRouterForToken(LIVE.weth)).wait();

  // Wire registry → gateway before Timelock owns both
  await (await strategyRegistry.setOperator(execAddr, true)).wait();
  await (await strategyRegistry.setOpsGateway(gatewayAddr)).wait();

  if (!(await gateway.paused())) throw new Error("Deposit gateway must stay paused");

  await (await clExecutor.transferOwnership(TIMELOCK)).wait();
  await (await strategyRegistry.transferOwnership(TIMELOCK)).wait();
  await (await gateway.transferOwnership(TIMELOCK)).wait();

  const artifact = {
    version: 1,
    chainId: 8453,
    network: "base",
    mode: "OPS_GATEWAY_DEPOSIT_STACK",
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    governance: { safe: SAFE, timelock: TIMELOCK, delaySeconds: 172800 },
    libraries: libs,
    contracts: {
      strategyRegistry: registryAddr,
      strategyRegistryConstructorArgs: [
        LIVE.permissionRegistry,
        STRATEGY_KIND,
        LIVE.usdc,
      ],
      clExecutor: execAddr,
      clExecutorConstructorArgs: ctorArgs,
      opsGateway: gatewayAddr,
      opsGatewayConstructorArgs: gwCtor,
      withdrawGatewayLive: LIVE.withdrawGateway,
      clExecutorLiveUnchanged: LIVE.clExecutorLive,
      strategyRegistryLiveUnchanged: LIVE.strategyRegistryLive,
      permissionRegistryLive: LIVE.permissionRegistry,
    },
    adapters,
    deployedBytes: { clExecutor: execBytes },
    featureFlag: {
      opsGatewayWithdraw: false,
      opsGatewayDeposit: false,
      note: "Live flow stays on live registry/executor. Enable opsGatewayDeposit only after Safe wires PermissionRegistry + Timelock unpause + fork proof.",
    },
    safeMultisendRequired: [
      "permissionRegistry.setStrategyRegistrar(newRegistry, true)",
      "permissionRegistry.setOperator(newExecutor, true)",
      "permissionRegistry.setOperator(newRegistry, true)",
      "feeRouter.setExecutorApproved(newExecutor, true)",
      "swapRouter.setExecutorApproved(newExecutor, true)",
    ],
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(JSON.stringify({ phase: "done", artifact: OUT, gateway: gatewayAddr, executor: execAddr, registry: registryAddr }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
