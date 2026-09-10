#!/usr/bin/env node
/**
 * Build Safe → Timelock scheduleBatch for Ops Gateway activation.
 * DOES NOT broadcast. Delay floor = 172800 (48h).
 *
 * Honest batch (live Base as of 2026-09-10):
 * - Live StrategyPermissionRegistry @ 0xf669… has NO setOpsGateway — OMITTED (would revert).
 * - Gateway NPM allowlist / tracked tokens / router approves already applied at create (paused).
 * - Ownership of new executor + gateway already Timelock.
 * - This batch ONLY: newExecutor.setOpsGateway(gateway) + gateway.setPaused(false).
 *   Gateway stays paused until Timelock execute (after 48h).
 *
 * Deposit path remains blocked until a registry with opsGateway + adapters bound to the
 * new executor are cut over — do not enable features.opsGateway for deposit until then.
 * NPM withdraw (exitPercentToUsdc) can activate after unpause + app flag.
 *
 * Usage:
 *   node scripts/stable-club/build-timelock-ops-gateway.cjs
 *     [--gateway=0x...] [--new-executor=0x...]
 *   (defaults: deployments/base-mainnet/ops-gateway-create.json)
 */
const fs = require("fs");
const path = require("path");
const {
  encodeFunctionData,
  keccak256,
  stringToHex,
  encodeAbiParameters,
  parseAbiParameters,
} = require("viem");

const TIMELOCK = "0x6A83733C829B6F8a9C0E0D4d5713D64eE959167a";
const SAFE = "0x356A4A432EE57F31F5cF8Fdd55F95c1FF6Cd5910";
const DELAY = 172800;
const CL_EXECUTOR_LIVE = "0x455cc33194f82E253F41d91C1201eB4095c9D1Fa";
const STRATEGY_REGISTRY_LIVE = "0xf6696C45A1A186712c530696a5B392Ed9E18ae24";
const PERMISSION_REGISTRY_LIVE = "0xF75423289baA42A44981533152c81E16f1aFa069";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const ARTIFACT = path.join(
  __dirname,
  "../../deployments/base-mainnet/ops-gateway-create.json",
);

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

function loadAddrs() {
  let gateway = arg("gateway");
  let newExecutor = arg("new-executor");
  if ((!gateway || !newExecutor) && fs.existsSync(ARTIFACT)) {
    const a = JSON.parse(fs.readFileSync(ARTIFACT, "utf8"));
    gateway = gateway || a.contracts.opsGateway;
    newExecutor = newExecutor || a.contracts.clExecutorNew;
  }
  for (const [name, v] of [
    ["gateway", gateway],
    ["new-executor", newExecutor],
  ]) {
    if (!v || !/^0x[a-fA-F0-9]{40}$/.test(v)) {
      console.error(`Missing/invalid ${name}`);
      process.exit(1);
    }
  }
  return { gateway, newExecutor };
}

const { gateway, newExecutor } = loadAddrs();

const setOpsGatewayAbi = {
  type: "function",
  name: "setOpsGateway",
  stateMutability: "nonpayable",
  inputs: [{ name: "gateway_", type: "address" }],
};

const setPausedAbi = {
  type: "function",
  name: "setPaused",
  stateMutability: "nonpayable",
  inputs: [{ name: "paused_", type: "bool" }],
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

const executeBatchAbi = {
  type: "function",
  name: "executeBatch",
  stateMutability: "payable",
  inputs: [
    { name: "targets", type: "address[]" },
    { name: "values", type: "uint256[]" },
    { name: "payloads", type: "bytes[]" },
    { name: "predecessor", type: "bytes32" },
    { name: "salt", type: "bytes32" },
  ],
};

/** Only ops Timelock can succeed on (owners = Timelock; live registry omitted). */
const inner = [
  {
    target: newExecutor,
    data: encodeFunctionData({
      abi: [setOpsGatewayAbi],
      functionName: "setOpsGateway",
      args: [gateway],
    }),
    note: "newExecutor.setOpsGateway(gateway) — wires ViaExecutor path; NPM exit works without this",
  },
  {
    target: gateway,
    data: encodeFunctionData({
      abi: [setPausedAbi],
      functionName: "setPaused",
      args: [false],
    }),
    note: "gateway.setPaused(false) — KEEP paused until Timelock execute (≥48h after schedule)",
  },
];

const targets = inner.map((x) => x.target);
const values = inner.map(() => 0n);
const payloads = inner.map((x) => x.data);
const predecessor =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
const salt = keccak256(
  stringToHex(`ops-gateway-activate-v1:${gateway}:${newExecutor}`),
);

const scheduleData = encodeFunctionData({
  abi: [scheduleBatchAbi],
  functionName: "scheduleBatch",
  args: [targets, values, payloads, predecessor, salt, BigInt(DELAY)],
});

const executeData = encodeFunctionData({
  abi: [executeBatchAbi],
  functionName: "executeBatch",
  args: [targets, values, payloads, predecessor, salt],
});

/** OZ TimelockController.hashOperationBatch = keccak256(abi.encode(...)). */
function hashOperationBatch(targets_, values_, payloads_, predecessor_, salt_) {
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters(
        "address[] targets, uint256[] values, bytes[] payloads, bytes32 predecessor, bytes32 salt",
      ),
      [targets_, values_, payloads_, predecessor_, salt_],
    ),
  );
}

const operationId = hashOperationBatch(
  targets,
  values,
  payloads,
  predecessor,
  salt,
);

const out = {
  governance: {
    safe: SAFE,
    timelock: TIMELOCK,
    delaySeconds: DELAY,
    note: "2-of-3 Safe confirms scheduleBatch; executeBatch only after 48h. Gateway remains paused until execute.",
  },
  deployed: {
    gateway,
    newExecutor,
    depositLib: "0xb8d1ed3b9363d256875f24F6a40a5a338eACbCf5",
    exitLib: "0x72e7a08B022625F28A218DDf1f10244919672552",
    liveClExecutorUnchanged: CL_EXECUTOR_LIVE,
    liveStrategyRegistry: STRATEGY_REGISTRY_LIVE,
    livePermissionRegistry: PERMISSION_REGISTRY_LIVE,
    usdc: USDC,
  },
  omittedBecauseWouldRevert: [
    {
      call: "strategyRegistryLive.setOpsGateway(gateway)",
      reason:
        "Live StrategyPermissionRegistry bytecode has no setOpsGateway(address) selector 0x0d933f4f",
      address: STRATEGY_REGISTRY_LIVE,
    },
  ],
  compatibility: {
    existingPositions:
      "Unchanged — user-owned Uni/Aero NPM positions; no vault migration",
    liveExecutor:
      "Left in place for current app deposit/withdraw until full cutover",
    gatewayDeposit:
      "Blocked: live registry lacks registerWithSig/opsGateway; live adapters immutable to live executor",
    gatewayNpmWithdraw:
      "Ready after Timelock unpause + features.opsGateway pin (exitPercentToUsdc)",
  },
  featureFlag: {
    opsGateway: false,
    enableOnlyAfter:
      "Basescan verify + Timelock executeBatch success + paused===false + wallet E2E; pin opsGateway + features.opsGateway=true. Prefer withdraw-only first.",
  },
  innerOps: inner.map((x, i) => ({
    index: i,
    note: x.note,
    target: x.target,
    data: x.data,
  })),
  operationId,
  salt,
  predecessor,
  readyToSignSafeTransaction: {
    to: TIMELOCK,
    value: "0",
    data: scheduleData,
    operation: 0,
    description:
      "Safe → Timelock.scheduleBatch(setOpsGateway + setPaused(false), delay=172800)",
  },
  afterDelayExecuteSafeTransaction: {
    to: TIMELOCK,
    value: "0",
    data: executeData,
    operation: 0,
    description:
      "Safe → Timelock.executeBatch — submit ≥48h after schedule; unpauses gateway",
  },
};

process.stdout.write(JSON.stringify(out, null, 2) + "\n");
