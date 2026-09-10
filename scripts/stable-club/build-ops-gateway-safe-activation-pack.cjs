#!/usr/bin/env node
/**
 * Assemble Safe activation pack for Ops Gateway:
 *  A) Timelock scheduleBatch (withdraw gateway unpause) — ready-to-sign
 *  B) Immediate Safe MultiSend draft for deposit-stack PermissionRegistry / Fee / Swap wiring
 *     (does not unpause deposit gateway; Timelock owns deposit contracts)
 *
 * Does not broadcast. Never prints secrets.
 *
 *   node scripts/stable-club/build-ops-gateway-safe-activation-pack.cjs
 */
require("./load-local-env.cjs").loadLocalEnv();
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const {
  encodeFunctionData,
  encodePacked,
  concat,
  pad,
  toHex,
  size,
  keccak256,
  stringToHex,
} = require("viem");

const OUT = path.join(
  __dirname,
  "../../deployments/base-mainnet/ops-gateway-safe-activation-pack.json",
);
const DEPOSIT = path.join(
  __dirname,
  "../../deployments/base-mainnet/ops-gateway-deposit-stack.json",
);
const READY = path.join(
  __dirname,
  "../../deployments/base-mainnet/ops-gateway-ready-to-sign.json",
);

const SAFE = "0x356A4A432EE57F31F5cF8Fdd55F95c1FF6Cd5910";
const TIMELOCK = "0x6A83733C829B6F8a9C0E0D4d5713D64eE959167a";
const PERM = "0xF75423289baA42A44981533152c81E16f1aFa069";
const FEE = "0xf33239712875a7BD9d171cdD4d782c8FC022154C";
const SWAP = "0x56c6c76B4d5997754988d3C26083af315BfFa98F";
const MULTI_SEND = "0x40A2aCCbd92BCA938b02010E17A5b8929b49130D"; // Safe MultiSendCallOnly on Base

function rebuildReadyToSign() {
  execFileSync(
    process.execPath,
    ["scripts/stable-club/propose-ops-gateway-timelock.cjs"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

function encodeMultiSend(txs) {
  // Safe MultiSend encoding: packed (operation:uint8, to:address, value:uint256, dataLength:uint256, data)
  let packed = "0x";
  for (const tx of txs) {
    const data = tx.data;
    const dataLen = BigInt((data.length - 2) / 2);
    packed = concat([
      packed,
      toHex(tx.operation ?? 0, { size: 1 }),
      pad(tx.to, { size: 20 }),
      pad(toHex(tx.value ?? 0n), { size: 32 }),
      pad(toHex(dataLen), { size: 32 }),
      data,
    ]);
  }
  return encodeFunctionData({
    abi: [
      {
        type: "function",
        name: "multiSend",
        stateMutability: "payable",
        inputs: [{ name: "transactions", type: "bytes" }],
      },
    ],
    functionName: "multiSend",
    args: [packed],
  });
}

function main() {
  rebuildReadyToSign();
  const ready = JSON.parse(fs.readFileSync(READY, "utf8"));
  if (!fs.existsSync(DEPOSIT)) {
    throw new Error(`Missing deposit stack artifact: ${DEPOSIT}`);
  }
  const deposit = JSON.parse(fs.readFileSync(DEPOSIT, "utf8"));

  const setStrategyRegistrar = encodeFunctionData({
    abi: [
      {
        type: "function",
        name: "setStrategyRegistrar",
        inputs: [
          { name: "registrar", type: "address" },
          { name: "allowed", type: "bool" },
        ],
      },
    ],
    functionName: "setStrategyRegistrar",
    args: [deposit.contracts.strategyRegistry, true],
  });
  const setOperator = (op) =>
    encodeFunctionData({
      abi: [
        {
          type: "function",
          name: "setOperator",
          inputs: [
            { name: "operator", type: "address" },
            { name: "allowed", type: "bool" },
          ],
        },
      ],
      functionName: "setOperator",
      args: [op, true],
    });
  const setExecutorApproved = encodeFunctionData({
    abi: [
      {
        type: "function",
        name: "setExecutorApproved",
        inputs: [
          { name: "executor", type: "address" },
          { name: "approved", type: "bool" },
        ],
      },
    ],
    functionName: "setExecutorApproved",
    args: [deposit.contracts.clExecutor, true],
  });

  const depositWireTxs = [
    {
      to: PERM,
      value: 0n,
      operation: 0,
      data: setStrategyRegistrar,
      note: "permissionRegistry.setStrategyRegistrar(depositRegistry, true)",
    },
    {
      to: PERM,
      value: 0n,
      operation: 0,
      data: setOperator(deposit.contracts.clExecutor),
      note: "permissionRegistry.setOperator(depositExecutor, true)",
    },
    {
      to: PERM,
      value: 0n,
      operation: 0,
      data: setOperator(deposit.contracts.strategyRegistry),
      note: "permissionRegistry.setOperator(depositRegistry, true)",
    },
    {
      to: FEE,
      value: 0n,
      operation: 0,
      data: setExecutorApproved,
      note: "feeRouter.setExecutorApproved(depositExecutor, true)",
    },
    {
      to: SWAP,
      value: 0n,
      operation: 0,
      data: setExecutorApproved,
      note: "swapRouter.setExecutorApproved(depositExecutor, true)",
    },
  ];

  const multiSendData = encodeMultiSend(depositWireTxs);

  // Separate Timelock batch for deposit gateway unpause (after wire + verify)
  const setPausedFalse = encodeFunctionData({
    abi: [
      {
        type: "function",
        name: "setPaused",
        inputs: [{ name: "paused_", type: "bool" }],
      },
    ],
    functionName: "setPaused",
    args: [false],
  });
  const setOpsGatewayExec = encodeFunctionData({
    abi: [
      {
        type: "function",
        name: "setOpsGateway",
        inputs: [{ name: "gateway_", type: "address" }],
      },
    ],
    functionName: "setOpsGateway",
    args: [deposit.contracts.opsGateway],
  });

  const depositActivateInner = [
    {
      target: deposit.contracts.clExecutor,
      data: setOpsGatewayExec,
      note: "depositExecutor.setOpsGateway(depositGateway)",
    },
    {
      target: deposit.contracts.opsGateway,
      data: setPausedFalse,
      note: "depositGateway.setPaused(false)",
    },
  ];
  const depositSalt = keccak256(
    stringToHex(
      `ops-gateway-deposit-activate-v1:${deposit.contracts.opsGateway}:${deposit.contracts.clExecutor}`,
    ),
  );
  const scheduleBatchAbi = [
    {
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
    },
  ];
  const executeBatchAbi = [
    {
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
    },
  ];
  const depTargets = depositActivateInner.map((x) => x.target);
  const depValues = depTargets.map(() => 0n);
  const depPayloads = depositActivateInner.map((x) => x.data);
  const predecessor =
    "0x0000000000000000000000000000000000000000000000000000000000000000";
  const depositScheduleData = encodeFunctionData({
    abi: scheduleBatchAbi,
    functionName: "scheduleBatch",
    args: [depTargets, depValues, depPayloads, predecessor, depositSalt, 172800n],
  });
  const depositExecuteData = encodeFunctionData({
    abi: executeBatchAbi,
    functionName: "executeBatch",
    args: [depTargets, depValues, depPayloads, predecessor, depositSalt],
  });

  const pack = {
    assembledAt: new Date().toISOString(),
    safe: SAFE,
    timelock: TIMELOCK,
    featureFlagsRemainOff: {
      opsGatewayWithdraw: false,
      opsGatewayDeposit: false,
    },
    step1_withdrawTimelockSchedule: {
      description:
        "2-of-3 Safe → Timelock.scheduleBatch (setOpsGateway on withdraw executor + unpause withdraw gateway). Starts 48h countdown when mined.",
      readyToSignPath: READY,
      transaction: ready.transaction,
      safeTxHash: ready.safeTxHash,
      nonce: ready.nonce,
      operationId: ready.timelock.operationId,
      afterDelayExecute: ready.afterDelayExecute,
      countdown:
        "activationUnix = scheduleReceipt.block.timestamp + 172800 (not started until scheduleBatch is on-chain)",
    },
    step2_depositStackSafeMultisend: {
      description:
        "Immediate Safe MultiSend (DelegateCall to MultiSend) — wires live PermissionRegistry/FeeRouter/SwapRouter for deposit stack. Does NOT unpause deposit gateway.",
      to: MULTI_SEND,
      value: "0",
      operation: 1,
      data: multiSendData,
      inner: depositWireTxs.map((t, i) => ({
        index: i,
        note: t.note,
        to: t.to,
        data: t.data,
      })),
      contracts: {
        depositRegistry: deposit.contracts.strategyRegistry,
        depositExecutor: deposit.contracts.clExecutor,
        depositGateway: deposit.contracts.opsGateway,
      },
    },
    step3_depositTimelockUnpause: {
      description:
        "After step2 + Basescan verify: Safe → Timelock.scheduleBatch to setOpsGateway + unpause deposit gateway (separate 48h).",
      schedule: {
        to: TIMELOCK,
        value: "0",
        operation: 0,
        data: depositScheduleData,
      },
      executeAfterDelay: {
        to: TIMELOCK,
        value: "0",
        operation: 0,
        data: depositExecuteData,
      },
      salt: depositSalt,
      inner: depositActivateInner,
    },
    signingOrder: [
      "1. Sign+execute step1 (withdraw Timelock schedule). Record tx hash + timestamp; activation = ts+172800.",
      "2. Optionally propose step2 MultiSend (deposit infra wire) — keeps live flow; does not enable app deposit flag.",
      "3. After Basescan verify of all contracts, schedule step3; execute after 48h; then pin opsGatewayDeposit.",
      "4. Pin opsGatewayWithdraw only after step1 executeBatch succeeds and withdraw gateway paused===false.",
    ],
  };

  fs.writeFileSync(OUT, `${JSON.stringify(pack, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        wrote: OUT,
        withdrawNonce: ready.nonce,
        withdrawSafeTxHash: ready.safeTxHash,
        depositGateway: deposit.contracts.opsGateway,
        depositExecutor: deposit.contracts.clExecutor,
        depositRegistry: deposit.contracts.strategyRegistry,
      },
      null,
      2,
    ),
  );
}

main();
