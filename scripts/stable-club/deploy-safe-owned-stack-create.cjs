#!/usr/bin/env node
/**
 * P0-B: EOA CREATE-only deploy of a Safe-owned Phase 2a stack (no Timelock).
 *
 * Broadcasts ONLY:
 *  - CREATE for Ownables + 5 adapters
 *  - transferOwnership(Safe) on every Ownable
 *
 * Does NOT configure routes, operators, oracles, Permit2, or adapters.
 * Configuration is Safe multisig calldata via build-safe-owned-stack-config.cjs.
 *
 * Requires: BASE_RPC_URL, DEPLOYER_PRIVATE_KEY, STABLE_CLUB_BASE_DEPLOY_CONFIRMATION
 *
 * Usage:
 *   npx hardhat run scripts/stable-club/deploy-safe-owned-stack-create.cjs --network base
 */
require("dotenv").config({ path: ".env.local" });
const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");
const guards = require("./base-mainnet-deploy-guards.cjs");

const SAFE = guards.MVP_SAFE;

const OWNABLE_META = [
  { key: "permissionRegistry", name: "PermissionRegistry" },
  { key: "strategyRegistry", name: "StrategyPermissionRegistry" },
  { key: "feeRouter", name: "FeeRouter" },
  { key: "swapRouter", name: "StableClubSwapRouter" },
  { key: "oracleGuard", name: "OracleGuard" },
  { key: "mevGuard", name: "MevGuard" },
  { key: "safetyController", name: "SafetyController" },
  { key: "clExecutor", name: "StableClubConcentratedLiquidityExecutor" },
];

async function deployNamed(name, args) {
  const factory = await ethers.getContractFactory(name);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const tx = contract.deploymentTransaction();
  return {
    contract,
    address,
    createTx: tx?.hash ?? null,
    createBlock: tx?.blockNumber ?? null,
  };
}

async function transferToSafe(contract, key) {
  const tx = await contract.transferOwnership(SAFE);
  const receipt = await tx.wait();
  let owner = await contract.owner();
  for (let i = 0; i < 5 && !guards.addrEq(owner, SAFE); i++) {
    await new Promise((r) => setTimeout(r, 1500));
    owner = await contract.owner();
  }
  if (!guards.addrEq(owner, SAFE)) {
    throw new Error(`Ownership transfer failed for ${key} (owner=${owner})`);
  }
  return receipt.hash;
}

async function main() {
  guards.assertConfirmationPhrase(process.env.STABLE_CLUB_BASE_DEPLOY_CONFIRMATION);
  guards.assertDeployerPrivateKeyPresent(process.env.DEPLOYER_PRIVATE_KEY);
  if (!process.env.BASE_RPC_URL?.trim()) {
    throw new Error("BASE_RPC_URL required");
  }

  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  if (Number(net.chainId) !== guards.BASE_CHAIN_ID) {
    throw new Error(`Refuse non-Base chainId=${net.chainId}`);
  }

  // Strict address / bytecode / gas preflight before any CREATE.
  if (!ethers.isAddress(SAFE) || SAFE === ethers.ZeroAddress) {
    throw new Error("MVP Safe address invalid");
  }
  const safeCode = await ethers.provider.getCode(SAFE);
  if (!guards.isNonEmptyBytecode(safeCode)) {
    throw new Error("MVP Safe has no bytecode on Base — refusing CREATE");
  }
  for (const { label, address } of [
    { label: "USDC", address: guards.USDC },
    { label: "cbBTC", address: guards.CBBTC },
    { label: "WETH", address: guards.WETH },
    { label: "Permit2", address: guards.BASE_PERMIT2 },
  ]) {
    const code = await ethers.provider.getCode(address);
    if (!guards.isNonEmptyBytecode(code)) {
      throw new Error(`${label} missing bytecode at ${address}`);
    }
  }

  const bal = await ethers.provider.getBalance(deployer.address);
  const fee = await ethers.provider.getFeeData();
  const maxFeePerGas = fee.maxFeePerGas ?? fee.gasPrice ?? 0n;
  // Conservative CREATE-only budget: ~13 creates + 8 ownership transfers ≈ 25M gas worst-case.
  const gasBudget = 25_000_000n;
  const estimatedCost = gasBudget * maxFeePerGas;
  const minReserve = ethers.parseEther("0.001");
  if (bal < estimatedCost + minReserve) {
    throw new Error(
      `Insufficient deployer ETH: bal=${ethers.formatEther(bal)} need≈${ethers.formatEther(estimatedCost + minReserve)} (gasBudget=${gasBudget} maxFee=${maxFeePerGas})`,
    );
  }
  // Refuse runaway gas (Base private-beta ceiling is 1 gwei on SafetyController; CREATE uses network fees).
  const oneGwei = 1_000_000_000n;
  if (maxFeePerGas > oneGwei * 50n) {
    throw new Error(`maxFeePerGas ${maxFeePerGas} exceeds 50 gwei safety cap — refusing CREATE`);
  }

  console.log(
    JSON.stringify({
      phase: "preflight_ok",
      mode: "CREATE_AND_TRANSFER_ONLY",
      deployer: deployer.address,
      safeOwner: SAFE,
      safeCodeBytes: (safeCode.length - 2) / 2,
      timelock: null,
      chainId: Number(net.chainId),
      balanceEth: ethers.formatEther(bal),
      maxFeeGwei: ethers.formatUnits(maxFeePerGas, "gwei"),
      estimatedCostEth: ethers.formatEther(estimatedCost),
    }),
  );

  console.log(
    JSON.stringify({
      phase: "start",
      mode: "CREATE_AND_TRANSFER_ONLY",
      deployer: deployer.address,
      safeOwner: SAFE,
      timelock: null,
      chainId: Number(net.chainId),
    }),
  );

  const permissionRegistry = await deployNamed("PermissionRegistry", []);
  const strategyRegistry = await deployNamed("StrategyPermissionRegistry", [
    permissionRegistry.address,
    guards.strategyKind(),
    guards.USDC,
  ]);
  const feeRouter = await deployNamed("FeeRouter", [guards.MVP_FEE]);
  const swapRouter = await deployNamed("StableClubSwapRouter", []);
  const oracleGuard = await deployNamed("OracleGuard", []);
  const mevGuard = await deployNamed("MevGuard", []);
  const safetyController = await deployNamed("SafetyController", []);
  const clExecutor = await deployNamed("StableClubConcentratedLiquidityExecutor", [
    permissionRegistry.address,
    strategyRegistry.address,
    feeRouter.address,
    swapRouter.address,
    mevGuard.address,
    oracleGuard.address,
    safetyController.address,
    guards.USDC,
  ]);

  const ownables = {
    permissionRegistry,
    strategyRegistry,
    feeRouter,
    swapRouter,
    oracleGuard,
    mevGuard,
    safetyController,
    clExecutor,
  };

  const code = await ethers.provider.getCode(clExecutor.address);
  // RPC can briefly return empty/stale code right after CREATE — retry before failing.
  let codeLive = code;
  for (let i = 0; i < 8 && (!guards.isNonEmptyBytecode(codeLive) || codeLive.length < 100); i++) {
    await new Promise((r) => setTimeout(r, 1500));
    codeLive = await ethers.provider.getCode(clExecutor.address);
  }
  const harvestSel = ethers
    .id(
      "harvestAll(bytes32,(uint8,address,address,address,uint256,uint256,uint256,uint256)[5],uint256)",
    )
    .slice(2, 10);
  const compoundSel = ethers
    .id(
      "compoundAll(bytes32,(uint8,address,address,address,uint256,uint256,uint256,uint256)[5],uint256)",
    )
    .slice(2, 10);
  const exitSel = ethers
    .id(
      "exitAllToUsdc(bytes32,(uint8,address,address,address,uint256,uint128,uint256,uint256,uint256,bool)[5],(bytes32,uint256,uint256,uint256,uint256)[8],uint8,uint256,uint256)",
    )
    .slice(2, 10);
  for (const [label, sel] of [
    ["harvestAll", harvestSel],
    ["compoundAll", compoundSel],
    ["exitAllToUsdc", exitSel],
  ]) {
    if (!codeLive.toLowerCase().includes(sel)) {
      throw new Error(`Deployed CL executor bytecode missing ${label} selector 0x${sel}`);
    }
  }

  const specs = guards.buildAdapterSpecs(clExecutor.address);
  const adapters = [];
  for (const spec of specs) {
    let deployed;
    if (spec.protocol === "uniswap-v3") {
      deployed = await deployNamed("UniswapV3Adapter", [
        spec.executor,
        spec.poolId,
        spec.npm,
        spec.router,
        spec.poolAddress,
        spec.factory,
        spec.fee,
      ]);
    } else {
      deployed = await deployNamed("AerodromeSlipstreamAdapter", [
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
    adapters.push({
      poolId: spec.poolId,
      protocol: spec.protocol,
      generation: spec.generation,
      adapter: deployed.address,
      poolAddress: spec.poolAddress,
      factory: spec.factory,
      npm: spec.npm,
      router: spec.router,
      tickSpacing: spec.tickSpacing ?? null,
      fee: spec.fee ?? null,
      tokenA: spec.tokenA,
      tokenB: spec.tokenB,
      createTx: deployed.createTx,
      ownershipNote: guards.ADAPTER_OWNERSHIP_NOTE,
    });
    console.log(
      JSON.stringify({
        phase: "adapter",
        adapter: deployed.address,
        poolId: spec.poolId,
        createTx: deployed.createTx,
      }),
    );
  }

  const ownershipTransfers = {};
  for (const meta of OWNABLE_META) {
    const entry = ownables[meta.key];
    ownershipTransfers[meta.key] = await transferToSafe(entry.contract, meta.key);
    console.log(
      JSON.stringify({
        phase: "transferOwnership",
        key: meta.key,
        address: entry.address,
        owner: SAFE,
        tx: ownershipTransfers[meta.key],
      }),
    );
  }

  const out = {
    deployedAt: new Date().toISOString(),
    chainId: guards.BASE_CHAIN_ID,
    network: "base",
    mode: "SAFE_OWNED_CREATE_ONLY",
    deployer: deployer.address,
    safeOwner: SAFE,
    timelock: null,
    note:
      "CREATE + transferOwnership only. All protocol configuration is Safe calldata — do not broadcast config until founder approval.",
    cancelTimelockProposal:
      "Cancel/ignore pending Timelock Safe proposal 0x649f22a3… (conflicts with Safe-owned stack).",
    contracts: Object.fromEntries(
      OWNABLE_META.map((m) => [
        m.key,
        {
          address: ownables[m.key].address,
          createTx: ownables[m.key].createTx,
          owner: SAFE,
          ownershipTransferTx: ownershipTransfers[m.key],
        },
      ]),
    ),
    adapters,
    selectors: {
      harvestAll: `0x${harvestSel}`,
      compoundAll: `0x${compoundSel}`,
      exitAllToUsdc: `0x${exitSel}`,
    },
    nextSteps: [
      `node scripts/stable-club/build-safe-owned-stack-config.cjs --artifact=deployments/base-mainnet/safe-owned-stack-create.json`,
      "Review Safe approval pack — founder + second owner confirm (no agent broadcast)",
      "Tiny Base E2E: deposit → harvest → compound → exitAllToUsdc",
      "Only then: pin trusted manifest + features.exitAllToUsdc=true",
    ],
    depositsRemainDisabled: true,
  };

  const outDir = path.join(__dirname, "..", "..", "deployments", "base-mainnet");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "safe-owned-stack-create.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ phase: "done", artifact: outPath }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
