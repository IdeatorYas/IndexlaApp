#!/usr/bin/env node
/**
 * P0-B: Build every Safe configuration transaction for the Safe-owned stack.
 *
 * DOES NOT broadcast. Emits JSON for founder approval (Safe UI / Transaction Service).
 *
 * Usage:
 *   node scripts/stable-club/build-safe-owned-stack-config.cjs \
 *     --artifact=deployments/base-mainnet/safe-owned-stack-create.json
 *
 * Optional:
 *   --guardian=0x...   (required; must not be Safe or fee recipient)
 *   --out=path.json
 */
const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");
const { encodeFunctionData, keccak256, stringToHex } = require("viem");
const guards = require("./base-mainnet-deploy-guards.cjs");
const { CANONICAL_INFRA, BASE_PERMIT2, EXPECTED_ROUTE_IDS } = require("./phase2a-manifest.cjs");

const SAFE = guards.MVP_SAFE;
const CANCEL_TIMELOCK_PROPOSAL =
  "0x649f22a3… — cancel/ignore pending Timelock scheduleBatch (conflicts with Safe-owned stack)";

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

function requireAddr(label, value) {
  if (!value || !ethers.isAddress(value) || value === ethers.ZeroAddress) {
    throw new Error(`${label} must be a non-zero address`);
  }
  return ethers.getAddress(value);
}

const configureRouteAbi = {
  type: "function",
  name: "configureRoute",
  stateMutability: "nonpayable",
  inputs: [
    { name: "routeId", type: "bytes32" },
    {
      name: "config",
      type: "tuple",
      components: [
        { name: "kind", type: "uint8" },
        { name: "router", type: "address" },
        { name: "factory", type: "address" },
        { name: "pool", type: "address" },
        { name: "tokenIn", type: "address" },
        { name: "tokenOut", type: "address" },
        { name: "feeOrTickSpacing", type: "uint24" },
        { name: "enabled", type: "bool" },
      ],
    },
  ],
};

const abis = {
  setOracle: {
    type: "function",
    name: "setOracle",
    stateMutability: "nonpayable",
    inputs: [{ name: "oracle_", type: "address" }],
  },
  configureFeed: {
    type: "function",
    name: "configureFeed",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "aggregator", type: "address" },
      { name: "maxStalenessSec", type: "uint256" },
      { name: "decimals_", type: "uint8" },
    ],
  },
  configurePegMonitor: {
    type: "function",
    name: "configurePegMonitor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "referenceAggregator", type: "address" },
      { name: "maxDeviationBps", type: "uint256" },
      { name: "decimals_", type: "uint8" },
      { name: "enabled", type: "bool" },
    ],
  },
  setPermit2: {
    type: "function",
    name: "setPermit2",
    stateMutability: "nonpayable",
    inputs: [{ name: "permit2_", type: "address" }],
  },
  setExecutorApproved: {
    type: "function",
    name: "setExecutorApproved",
    stateMutability: "nonpayable",
    inputs: [
      { name: "executor", type: "address" },
      { name: "approved", type: "bool" },
    ],
  },
  setOperator: {
    type: "function",
    name: "setOperator",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator_", type: "address" },
      { name: "allowed", type: "bool" },
    ],
  },
  setStrategyRegistrar: {
    type: "function",
    name: "setStrategyRegistrar",
    stateMutability: "nonpayable",
    inputs: [
      { name: "registrar", type: "address" },
      { name: "allowed", type: "bool" },
    ],
  },
  setTokenApproval: {
    type: "function",
    name: "setTokenApproval",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "approved", type: "bool" },
    ],
  },
  setAdapterApproval: {
    type: "function",
    name: "setAdapterApproval",
    stateMutability: "nonpayable",
    inputs: [
      { name: "adapter", type: "address" },
      { name: "approved", type: "bool" },
    ],
  },
  registerPool: {
    type: "function",
    name: "registerPool",
    stateMutability: "nonpayable",
    inputs: [
      { name: "poolId", type: "bytes32" },
      { name: "adapter", type: "address" },
    ],
  },
  setGuardian: {
    type: "function",
    name: "setGuardian",
    stateMutability: "nonpayable",
    inputs: [{ name: "guardian_", type: "address" }],
  },
  setMaxGasPriceWei: {
    type: "function",
    name: "setMaxGasPriceWei",
    stateMutability: "nonpayable",
    inputs: [{ name: "weiPrice", type: "uint256" }],
  },
};

function pushTx(list, { label, to, method, args, abi }) {
  const data = encodeFunctionData({
    abi: [abi],
    functionName: method,
    args,
  });
  list.push({
    label,
    to: ethers.getAddress(to),
    value: "0",
    data,
    operation: 0,
    decoded: { method, args: JSON.parse(JSON.stringify(args, (_, v) => (typeof v === "bigint" ? v.toString() : v))) },
  });
}

function buildReverseRoutes() {
  const uni = CANONICAL_INFRA["uniswap-v3"];
  const aeroL = CANONICAL_INFRA["aerodrome-legacy"];
  return [
    {
      name: "CBBTC_USDC_UNI",
      id: keccak256(stringToHex("ROUTE_CBBTC_USDC_UNI_005")),
      cfg: {
        kind: 0,
        router: uni.router,
        factory: uni.factory,
        pool: "0xfBB6Eed8e7aa03B138556eeDaF5D271A5E1e43ef",
        tokenIn: guards.CBBTC,
        tokenOut: guards.USDC,
        feeOrTickSpacing: 500,
        enabled: true,
      },
    },
    {
      name: "CBBTC_USDC_AERO_L",
      id: keccak256(stringToHex("ROUTE_CBBTC_USDC_AERO_LEGACY_100")),
      cfg: {
        kind: 1,
        router: aeroL.router,
        factory: aeroL.factory,
        pool: "0x4e962bb3889bf030368f56810a9c96b83cb3e778",
        tokenIn: guards.CBBTC,
        tokenOut: guards.USDC,
        feeOrTickSpacing: 100,
        enabled: true,
      },
    },
    {
      name: "WETH_USDC_UNI",
      id: keccak256(stringToHex("ROUTE_WETH_USDC_UNI_005")),
      cfg: {
        kind: 0,
        router: uni.router,
        factory: uni.factory,
        pool: "0xd0b53D9277642d899DF5C87A3966A349A798F224",
        tokenIn: guards.WETH,
        tokenOut: guards.USDC,
        feeOrTickSpacing: 500,
        enabled: true,
      },
    },
    {
      name: "WETH_USDC_AERO_L",
      id: keccak256(stringToHex("ROUTE_WETH_USDC_AERO_LEGACY_100")),
      cfg: {
        kind: 1,
        router: aeroL.router,
        factory: aeroL.factory,
        pool: "0xb2cc224c1c9feE385f8ad6a55b4d94E92359DC59",
        tokenIn: guards.WETH,
        tokenOut: guards.USDC,
        feeOrTickSpacing: 100,
        enabled: true,
      },
    },
  ];
}

async function main() {
  const artifactPath = arg("artifact");
  if (!artifactPath) {
    console.error(
      "Usage: node scripts/stable-club/build-safe-owned-stack-config.cjs --artifact=... [--guardian=0x...] [--out=...]",
    );
    process.exit(1);
  }
  const absArtifact = path.isAbsolute(artifactPath)
    ? artifactPath
    : path.join(process.cwd(), artifactPath);
  const artifact = JSON.parse(fs.readFileSync(absArtifact, "utf8"));

  const c = artifact.contracts;
  if (!c?.clExecutor?.address || !Array.isArray(artifact.adapters) || artifact.adapters.length !== 5) {
    throw new Error("Artifact missing contracts/adapters from CREATE step");
  }

  const guardianRaw = arg("guardian") || process.env.STABLE_CLUB_GUARDIAN_ADDRESS;
  const guardian = guards.assertGuardianAddress(guardianRaw);

  const permissionRegistry = requireAddr("permissionRegistry", c.permissionRegistry.address);
  const strategyRegistry = requireAddr("strategyRegistry", c.strategyRegistry.address);
  const feeRouter = requireAddr("feeRouter", c.feeRouter.address);
  const swapRouter = requireAddr("swapRouter", c.swapRouter.address);
  const oracleGuard = requireAddr("oracleGuard", c.oracleGuard.address);
  const mevGuard = requireAddr("mevGuard", c.mevGuard.address);
  const safetyController = requireAddr("safetyController", c.safetyController.address);
  const clExecutor = requireAddr("clExecutor", c.clExecutor.address);

  const txs = [];

  // --- Oracle / Mev / Safety ---
  pushTx(txs, {
    label: "MevGuard.setOracle(oracleGuard)",
    to: mevGuard,
    method: "setOracle",
    abi: abis.setOracle,
    args: [oracleGuard],
  });
  pushTx(txs, {
    label: "OracleGuard.configureFeed USDC",
    to: oracleGuard,
    method: "configureFeed",
    abi: abis.configureFeed,
    args: [guards.USDC, guards.USDC_USD, BigInt(48 * 3600), 8],
  });
  pushTx(txs, {
    label: "OracleGuard.configureFeed cbBTC",
    to: oracleGuard,
    method: "configureFeed",
    abi: abis.configureFeed,
    args: [guards.CBBTC, guards.CBBTC_USD, BigInt(4 * 3600), 8],
  });
  pushTx(txs, {
    label: "OracleGuard.configureFeed WETH",
    to: oracleGuard,
    method: "configureFeed",
    abi: abis.configureFeed,
    args: [guards.WETH, guards.WETH_USD, BigInt(4 * 3600), 8],
  });
  pushTx(txs, {
    label: "OracleGuard.configurePegMonitor cbBTC/BTC",
    to: oracleGuard,
    method: "configurePegMonitor",
    abi: abis.configurePegMonitor,
    args: [guards.CBBTC, guards.BTC_USD, 100, 8, true],
  });
  pushTx(txs, {
    label: "SafetyController.setGuardian",
    to: safetyController,
    method: "setGuardian",
    abi: abis.setGuardian,
    args: [guardian],
  });
  pushTx(txs, {
    label: "SafetyController.setMaxGasPriceWei (1 gwei)",
    to: safetyController,
    method: "setMaxGasPriceWei",
    abi: abis.setMaxGasPriceWei,
    args: [guards.GAS_CEILING_WEI],
  });

  // --- Registries / routers ---
  pushTx(txs, {
    label: "PermissionRegistry.setStrategyRegistrar(strategyRegistry)",
    to: permissionRegistry,
    method: "setStrategyRegistrar",
    abi: abis.setStrategyRegistrar,
    args: [strategyRegistry, true],
  });
  pushTx(txs, {
    label: "PermissionRegistry.setOperator(clExecutor)",
    to: permissionRegistry,
    method: "setOperator",
    abi: abis.setOperator,
    args: [clExecutor, true],
  });
  pushTx(txs, {
    label: "PermissionRegistry.setOperator(strategyRegistry)",
    to: permissionRegistry,
    method: "setOperator",
    abi: abis.setOperator,
    args: [strategyRegistry, true],
  });
  pushTx(txs, {
    label: "StrategyRegistry.setOperator(clExecutor)",
    to: strategyRegistry,
    method: "setOperator",
    abi: abis.setOperator,
    args: [clExecutor, true],
  });
  pushTx(txs, {
    label: "FeeRouter.setPermit2",
    to: feeRouter,
    method: "setPermit2",
    abi: abis.setPermit2,
    args: [BASE_PERMIT2],
  });
  pushTx(txs, {
    label: "FeeRouter.setExecutorApproved(clExecutor)",
    to: feeRouter,
    method: "setExecutorApproved",
    abi: abis.setExecutorApproved,
    args: [clExecutor, true],
  });
  pushTx(txs, {
    label: "SwapRouter.setExecutorApproved(clExecutor)",
    to: swapRouter,
    method: "setExecutorApproved",
    abi: abis.setExecutorApproved,
    args: [clExecutor, true],
  });

  // --- CL executor wiring ---
  pushTx(txs, {
    label: "ClExecutor.setPermit2",
    to: clExecutor,
    method: "setPermit2",
    abi: abis.setPermit2,
    args: [BASE_PERMIT2],
  });
  for (const token of [guards.USDC, guards.CBBTC, guards.WETH]) {
    pushTx(txs, {
      label: `ClExecutor.setTokenApproval(${token})`,
      to: clExecutor,
      method: "setTokenApproval",
      abi: abis.setTokenApproval,
      args: [token, true],
    });
  }

  for (const [i, a] of artifact.adapters.entries()) {
    const adapter = requireAddr(`adapter[${i}]`, a.adapter);
    pushTx(txs, {
      label: `ClExecutor.setAdapterApproval[${i}]`,
      to: clExecutor,
      method: "setAdapterApproval",
      abi: abis.setAdapterApproval,
      args: [adapter, true],
    });
    pushTx(txs, {
      label: `ClExecutor.registerPool[${i}] ${a.poolId}`,
      to: clExecutor,
      method: "registerPool",
      abi: abis.registerPool,
      args: [a.poolId, adapter],
    });
  }

  // --- Deposit routes (4) + reverse USDC unwind (4) ---
  const depositRoutes = guards.buildRouteConfigs();
  for (const r of depositRoutes) {
    pushTx(txs, {
      label: `SwapRouter.configureRoute deposit ${r.name}`,
      to: swapRouter,
      method: "configureRoute",
      abi: configureRouteAbi,
      args: [r.id, r.cfg],
    });
  }
  const reverseRoutes = buildReverseRoutes();
  for (const r of reverseRoutes) {
    pushTx(txs, {
      label: `SwapRouter.configureRoute reverse ${r.name}`,
      to: swapRouter,
      method: "configureRoute",
      abi: configureRouteAbi,
      args: [r.id, r.cfg],
    });
  }

  const pack = {
    status: "CALLDATA_ONLY_NO_BROADCAST",
    purpose: "P0-B Safe-owned stack configuration (no Timelock)",
    safe: SAFE,
    safeThresholdNote: "2-of-3 — founder + second owner must confirm; agent will not broadcast",
    cancelTimelockProposal: CANCEL_TIMELOCK_PROPOSAL,
    depositsRemainDisabled: true,
    doNotEnableUntil: [
      "Safe config batch confirmed on-chain",
      "Tiny Base E2E: deposit → harvest → compound → exitAllToUsdc USDC-only",
      "Then pin trusted manifest + features.exitAllToUsdc=true",
    ],
    sourceArtifact: path.relative(process.cwd(), absArtifact).replace(/\\/g, "/"),
    guardian,
    addresses: {
      permissionRegistry,
      strategyRegistry,
      feeRouter,
      swapRouter,
      oracleGuard,
      mevGuard,
      safetyController,
      clExecutor,
      permit2: BASE_PERMIT2,
      adapters: artifact.adapters.map((a) => ({
        poolId: a.poolId,
        adapter: ethers.getAddress(a.adapter),
      })),
    },
    depositRouteIds: EXPECTED_ROUTE_IDS,
    reverseRouteIds: Object.fromEntries(reverseRoutes.map((r) => [r.name, r.id])),
    safeTransactions: txs,
    txCount: txs.length,
    createTxHashesInformationalOnly: {
      note: "EOA CREATE hashes from deploy-safe-owned-stack-create.cjs — not Safe txs",
      ownables: Object.fromEntries(
        Object.entries(c).map(([k, v]) => [k, { address: v.address, createTx: v.createTx }]),
      ),
      adapters: artifact.adapters.map((a) => ({
        adapter: a.adapter,
        createTx: a.createTx,
      })),
    },
  };

  const outPath =
    arg("out") ||
    path.join(
      process.cwd(),
      "deployments",
      "base-mainnet",
      "safe-owned-stack-approval-pack.json",
    );
  const absOut = path.isAbsolute(outPath) ? outPath : path.join(process.cwd(), outPath);
  fs.mkdirSync(path.dirname(absOut), { recursive: true });
  fs.writeFileSync(absOut, JSON.stringify(pack, null, 2));
  console.log(
    JSON.stringify(
      {
        status: pack.status,
        out: absOut,
        txCount: pack.txCount,
        safe: SAFE,
        depositsRemainDisabled: true,
        cancelTimelockProposal: CANCEL_TIMELOCK_PROPOSAL,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
