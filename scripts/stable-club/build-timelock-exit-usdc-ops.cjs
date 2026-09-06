#!/usr/bin/env node
/**
 * Build Safe → Timelock scheduleBatch calldata for reverse USDC unwind routes
 * + setExecutorApproved(newClExecutor, true) on live swapRouter / feeRouter.
 *
 * DOES NOT broadcast. Safe is 2-of-3 — one owner cannot complete Timelock schedule alone.
 *
 * Usage:
 *   node scripts/stable-club/build-timelock-exit-usdc-ops.cjs --new-executor=0x...
 */
const { keccak256, stringToHex, encodeFunctionData, encodeAbiParameters, parseAbiParameters } = require("viem");

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const CBBTC = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
const WETH = "0x4200000000000000000000000000000000000006";
const SWAP_ROUTER = "0x46EbaC1c66f1A747084899b61a82Bf5A80E9C3F3";
const FEE_ROUTER = "0x4660Fd35f6e856ED1a959d5261F0E8a132E8E39c";
const PERMISSION_REGISTRY = "0xe7b38db8B3910fd65486e33C684cEB5b0Cb56196";
const STRATEGY_REGISTRY = "0x6052FD15529B9d77aDd7F9C4b45804a7d07BEd83";
const TIMELOCK = "0x6A83733C829B6F8a9C0E0D4d5713D64eE959167a";
const SAFE = "0x356A4A432EE57F31F5cF8Fdd55F95c1FF6Cd5910";
const DELAY = 172800; // 48h exact floor

const UNI_FACTORY = "0x33128a8fC17869897dcE68Ed026d694621f6FDfD";
const UNI_ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481";
const AERO_FACTORY_LEGACY = "0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A";
const AERO_ROUTER_LEGACY = "0xBE6D8f0d05cC4be24d5167a3eF062215bE6D18a5";
const POOL_USDC_CBBTC_UNI = "0xfBB6Eed8e7aa03B138556eeDaF5D271A5E1e43ef";
const POOL_USDC_CBBTC_AERO_L = "0x4e962bb3889bf030368f56810a9c96b83cb3e778";
const POOL_USDC_WETH_UNI = "0xd0b53D9277642d899DF5C87A3966A349A798F224";
const POOL_USDC_WETH_AERO_L = "0xb2cc224c1c9feE385f8ad6a55b4d94E92359DC59";

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

const setExecutorApprovedAbi = {
  type: "function",
  name: "setExecutorApproved",
  stateMutability: "nonpayable",
  inputs: [
    { name: "executor", type: "address" },
    { name: "approved", type: "bool" },
  ],
};

const setOperatorAbi = {
  type: "function",
  name: "setOperator",
  stateMutability: "nonpayable",
  inputs: [
    { name: "operator_", type: "address" },
    { name: "allowed", type: "bool" },
  ],
};

const scheduleBatchAbi = {
  type: "function",
  name: "scheduleBatch",
  stateMutability: "nonpayable",
  inputs: [
    { name: "targets", type: "address[]" },
    { name: "values", type: "uint256[]" },
    { name: "payloads", type: "bytes[]" },
    { name: "predecessor", type: "bytes32" },
    { name: "salt", type: "bytes32" },
    { name: "delay", type: "uint256" },
  ],
};

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const newExecutor = arg("new-executor");
if (!newExecutor || !/^0x[a-fA-F0-9]{40}$/.test(newExecutor)) {
  console.error("Usage: node scripts/stable-club/build-timelock-exit-usdc-ops.cjs --new-executor=0x...");
  process.exit(1);
}

const reverseRoutes = [
  {
    label: "ROUTE_CBBTC_USDC_UNI_005",
    id: keccak256(stringToHex("ROUTE_CBBTC_USDC_UNI_005")),
    cfg: {
      kind: 0,
      router: UNI_ROUTER,
      factory: UNI_FACTORY,
      pool: POOL_USDC_CBBTC_UNI,
      tokenIn: CBBTC,
      tokenOut: USDC,
      feeOrTickSpacing: 500,
      enabled: true,
    },
  },
  {
    label: "ROUTE_CBBTC_USDC_AERO_LEGACY_100",
    id: keccak256(stringToHex("ROUTE_CBBTC_USDC_AERO_LEGACY_100")),
    cfg: {
      kind: 1,
      router: AERO_ROUTER_LEGACY,
      factory: AERO_FACTORY_LEGACY,
      pool: POOL_USDC_CBBTC_AERO_L,
      tokenIn: CBBTC,
      tokenOut: USDC,
      feeOrTickSpacing: 100,
      enabled: true,
    },
  },
  {
    label: "ROUTE_WETH_USDC_UNI_005",
    id: keccak256(stringToHex("ROUTE_WETH_USDC_UNI_005")),
    cfg: {
      kind: 0,
      router: UNI_ROUTER,
      factory: UNI_FACTORY,
      pool: POOL_USDC_WETH_UNI,
      tokenIn: WETH,
      tokenOut: USDC,
      feeOrTickSpacing: 500,
      enabled: true,
    },
  },
  {
    label: "ROUTE_WETH_USDC_AERO_LEGACY_100",
    id: keccak256(stringToHex("ROUTE_WETH_USDC_AERO_LEGACY_100")),
    cfg: {
      kind: 1,
      router: AERO_ROUTER_LEGACY,
      factory: AERO_FACTORY_LEGACY,
      pool: POOL_USDC_WETH_AERO_L,
      tokenIn: WETH,
      tokenOut: USDC,
      feeOrTickSpacing: 100,
      enabled: true,
    },
  },
];

const targets = [];
const values = [];
const payloads = [];

for (const r of reverseRoutes) {
  targets.push(SWAP_ROUTER);
  values.push(0n);
  payloads.push(
    encodeFunctionData({
      abi: [configureRouteAbi],
      functionName: "configureRoute",
      args: [r.id, r.cfg],
    }),
  );
}

targets.push(SWAP_ROUTER);
values.push(0n);
payloads.push(
  encodeFunctionData({
    abi: [setExecutorApprovedAbi],
    functionName: "setExecutorApproved",
    args: [newExecutor, true],
  }),
);

targets.push(FEE_ROUTER);
values.push(0n);
payloads.push(
  encodeFunctionData({
    abi: [setExecutorApprovedAbi],
    functionName: "setExecutorApproved",
    args: [newExecutor, true],
  }),
);

targets.push(PERMISSION_REGISTRY);
values.push(0n);
payloads.push(
  encodeFunctionData({
    abi: [setOperatorAbi],
    functionName: "setOperator",
    args: [newExecutor, true],
  }),
);

targets.push(STRATEGY_REGISTRY);
values.push(0n);
payloads.push(
  encodeFunctionData({
    abi: [setOperatorAbi],
    functionName: "setOperator",
    args: [newExecutor, true],
  }),
);

const predecessor = "0x0000000000000000000000000000000000000000000000000000000000000000";
const salt = keccak256(stringToHex(`INDEXLA_EXIT_USDC_CUTOVER_V2_${newExecutor.toLowerCase()}`));

const scheduleBatchData = encodeFunctionData({
  abi: [scheduleBatchAbi],
  functionName: "scheduleBatch",
  args: [targets, values, payloads, predecessor, salt, BigInt(DELAY)],
});

const now = Math.floor(Date.now() / 1000);

console.log(
  JSON.stringify(
    {
      status: "CALLDATA_ONLY_NO_BROADCAST",
      reason:
        "Timelock PROPOSER_ROLE is MVP Safe (2-of-3). Deployer EOA cannot schedule. After Safe executes scheduleBatch, earliest executeAt = scheduleTimestamp + 172800s.",
      safe: SAFE,
      timelock: TIMELOCK,
      delaySeconds: DELAY,
      delayHours: 48,
      newExecutor,
      reverseRoutes: reverseRoutes.map((r) => ({ label: r.label, routeId: r.id })),
      safeTransaction: {
        to: TIMELOCK,
        value: "0",
        data: scheduleBatchData,
        operation: 0,
      },
      scheduleBatch: {
        targets,
        values: values.map((v) => v.toString()),
        payloads,
        predecessor,
        salt,
        delay: DELAY,
      },
      afterScheduleNote:
        "Record block.timestamp T from schedule receipt. Exact earliest execution = T + 172800 (UTC). Then Safe executes identical scheduleBatch args via Timelock.executeBatch.",
      estimatedIfScheduledNowUtc: new Date((now + DELAY) * 1000).toISOString(),
      postExecuteAppSteps: [
        "Verify exitAllToUsdc in new executor bytecode",
        "Verify reverse routes enabled on swapRouter",
        "Pin trusted manifest addresses + features.exitAllToUsdc=true",
        "Deploy app enabling Deposit + Withdraw together",
        "Never enable legacy exitAll in product UI",
      ],
    },
    null,
    2,
  ),
);
