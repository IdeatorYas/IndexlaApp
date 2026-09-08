#!/usr/bin/env node
/**
 * Build Safe MultiSend calldata to wire a NEW exit-percent CL executor + adapters
 * into the existing Safe-owned shared stack.
 *
 * DOES NOT broadcast. Requires exit-percent-cutover-create.json from CREATE step.
 *
 *   node scripts/stable-club/build-exit-percent-cutover-pack.cjs \
 *     --artifact=deployments/base-mainnet/exit-percent-cutover-create.json
 *
 * Safe must review/sign. Agent does not bypass governance.
 */
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const { encodeFunctionData } = require("viem");
const guards = require("./base-mainnet-deploy-guards.cjs");

const SAFE = guards.MVP_SAFE;

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

const abis = {
  setOperator: {
    type: "function",
    name: "setOperator",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
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
  setPermit2: {
    type: "function",
    name: "setPermit2",
    stateMutability: "nonpayable",
    inputs: [{ name: "permit2_", type: "address" }],
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
};

function pushTx(txs, { label, to, method, abi, args }) {
  const data = encodeFunctionData({ abi: [abi], functionName: method, args });
  txs.push({
    label,
    to: requireAddr(label, to),
    value: "0",
    data,
    operation: 0,
    decoded: { method, args },
  });
}

async function main() {
  const absArtifact = path.resolve(
    process.cwd(),
    arg("artifact") || "deployments/base-mainnet/exit-percent-cutover-create.json",
  );
  if (!fs.existsSync(absArtifact)) {
    throw new Error(
      `Missing cutover CREATE artifact at ${absArtifact}. Run deploy-exit-percent-cutover-create.cjs first (requires deploy confirmation).`,
    );
  }
  const artifact = JSON.parse(fs.readFileSync(absArtifact, "utf8"));
  const shared = artifact.sharedContracts;
  const clExecutor = requireAddr("clExecutor", artifact.contracts.clExecutor.address);

  const txs = [];

  pushTx(txs, {
    label: "PermissionRegistry.setOperator(newClExecutor)",
    to: shared.permissionRegistry,
    method: "setOperator",
    abi: abis.setOperator,
    args: [clExecutor, true],
  });
  pushTx(txs, {
    label: "StrategyRegistry.setOperator(newClExecutor)",
    to: shared.strategyRegistry,
    method: "setOperator",
    abi: abis.setOperator,
    args: [clExecutor, true],
  });
  pushTx(txs, {
    label: "FeeRouter.setExecutorApproved(newClExecutor)",
    to: shared.feeRouter,
    method: "setExecutorApproved",
    abi: abis.setExecutorApproved,
    args: [clExecutor, true],
  });
  pushTx(txs, {
    label: "SwapRouter.setExecutorApproved(newClExecutor)",
    to: shared.swapRouter,
    method: "setExecutorApproved",
    abi: abis.setExecutorApproved,
    args: [clExecutor, true],
  });

  // Configure on the NEW executor (owner = Safe)
  pushTx(txs, {
    label: "NewClExecutor.setPermit2",
    to: clExecutor,
    method: "setPermit2",
    abi: abis.setPermit2,
    args: [guards.BASE_PERMIT2],
  });
  for (const token of [guards.USDC, guards.CBBTC, guards.WETH]) {
    pushTx(txs, {
      label: `NewClExecutor.setTokenApproval(${token})`,
      to: clExecutor,
      method: "setTokenApproval",
      abi: abis.setTokenApproval,
      args: [token, true],
    });
  }
  for (const [i, a] of artifact.adapters.entries()) {
    const adapter = requireAddr(`adapter[${i}]`, a.adapter);
    pushTx(txs, {
      label: `NewClExecutor.setAdapterApproval[${i}]`,
      to: clExecutor,
      method: "setAdapterApproval",
      abi: abis.setAdapterApproval,
      args: [adapter, true],
    });
    pushTx(txs, {
      label: `NewClExecutor.registerPool[${i}]`,
      to: clExecutor,
      method: "registerPool",
      abi: abis.registerPool,
      args: [a.poolId, adapter],
    });
  }

  const pack = {
    status: "CALLDATA_ONLY_NO_BROADCAST",
    purpose: "Exit-percent cutover: wire new CL executor+adapters (decreaseLiquidityTo) into live shared stack",
    safe: SAFE,
    safeThresholdNote: "2-of-3 — founder + second owner must confirm; agent will not broadcast",
    compatibility: {
      existingPositions:
        "OLD adapters remain required for strategies registered against previous clExecutor bindings. Users must complete 100% exitAllToUsdc on the previous stack, then register a NEW strategy (IDs non-recyclable) targeting the new adapters before partial % is available.",
      strategyIdsNonRecyclable: true,
    },
    doNotEnableUntil: [
      "Safe MultiSend executed on-chain",
      "Basescan verify new executor + 5 adapters",
      "Fork + tiny Base E2E: deposit → exitAllToUsdc 20% → 50% → 100%",
      "Pin trusted manifest addresses + features.exitPercentToUsdc=true",
    ],
    sourceArtifact: path.relative(process.cwd(), absArtifact).replace(/\\/g, "/"),
    addresses: {
      newClExecutor: clExecutor,
      previousClExecutor: artifact.previousClExecutor,
      shared,
      adapters: artifact.adapters.map((a) => ({
        poolId: a.poolId,
        adapter: ethers.getAddress(a.adapter),
      })),
    },
    safeTransactions: txs,
    txCount: txs.length,
  };

  const outPath =
    arg("out") ||
    path.join(
      process.cwd(),
      "deployments/base-mainnet/exit-percent-cutover-approval-pack.json",
    );
  fs.writeFileSync(outPath, JSON.stringify(pack, null, 2));
  console.log(
    JSON.stringify({
      wrote: outPath,
      txCount: txs.length,
      newClExecutor: clExecutor,
      status: pack.status,
    }),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
