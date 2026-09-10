#!/usr/bin/env node
/**
 * Offline revalidation of Safe → Timelock schedule payload + eth_call simulation.
 * Does NOT broadcast. Prints activation formula: activation = scheduleBlock.timestamp + 172800.
 *
 *   node scripts/stable-club/revalidate-ops-gateway-timelock.cjs
 */
require("dotenv").config({ path: ".env.local" });
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const {
  createPublicClient,
  http,
  hashTypedData,
  parseAbi,
  encodeFunctionData,
} = require("viem");
const { base } = require("viem/chains");

const SAFE = "0x356A4A432EE57F31F5cF8Fdd55F95c1FF6Cd5910";
const TIMELOCK = "0x6A83733C829B6F8a9C0E0D4d5713D64eE959167a";
const DELAY = 172800;
const OUT = path.join(
  __dirname,
  "../../deployments/base-mainnet/ops-gateway-ready-to-sign.json",
);
const SIM_OUT = path.join(
  __dirname,
  "../../deployments/base-mainnet/ops-gateway-timelock-sim.json",
);

const EIP712_SAFE_TX_TYPE = {
  SafeTx: [
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "data", type: "bytes" },
    { name: "operation", type: "uint8" },
    { name: "safeTxGas", type: "uint256" },
    { name: "baseGas", type: "uint256" },
    { name: "gasPrice", type: "uint256" },
    { name: "gasToken", type: "address" },
    { name: "refundReceiver", type: "address" },
    { name: "nonce", type: "uint256" },
  ],
};

async function main() {
  // Rebuild batch from artifact
  execFileSync(process.execPath, ["scripts/stable-club/propose-ops-gateway-timelock.cjs"], {
    stdio: "inherit",
  });

  const ready = JSON.parse(fs.readFileSync(OUT, "utf8"));
  const publicClient = createPublicClient({
    chain: base,
    transport: http(process.env.BASE_RPC_URL),
  });

  const nonce = await publicClient.readContract({
    address: SAFE,
    abi: parseAbi(["function nonce() view returns (uint256)"]),
    functionName: "nonce",
  });
  const threshold = await publicClient.readContract({
    address: SAFE,
    abi: parseAbi(["function getThreshold() view returns (uint256)"]),
    functionName: "getThreshold",
  });
  const delay = await publicClient.readContract({
    address: TIMELOCK,
    abi: parseAbi(["function getMinDelay() view returns (uint256)"]),
    functionName: "getMinDelay",
  });

  const message = {
    to: TIMELOCK,
    value: 0n,
    data: ready.transaction.data,
    operation: 0,
    safeTxGas: 0n,
    baseGas: 0n,
    gasPrice: 0n,
    gasToken: "0x0000000000000000000000000000000000000000",
    refundReceiver: "0x0000000000000000000000000000000000000000",
    nonce,
  };
  const safeTxHash = hashTypedData({
    domain: { chainId: 8453, verifyingContract: SAFE },
    types: EIP712_SAFE_TX_TYPE,
    primaryType: "SafeTx",
    message,
  });

  let scheduleSim;
  try {
    await publicClient.call({
      account: SAFE,
      to: TIMELOCK,
      data: ready.transaction.data,
    });
    scheduleSim = { ok: true };
  } catch (e) {
    scheduleSim = { ok: false, error: e.shortMessage || e.message };
  }

  const innerSims = [];
  for (const op of ready.timelock.innerOps) {
    try {
      await publicClient.call({
        account: TIMELOCK,
        to: op.target,
        data: op.data,
      });
      innerSims.push({ index: op.index, ok: true, target: op.target });
    } catch (e) {
      innerSims.push({
        index: op.index,
        ok: false,
        target: op.target,
        error: e.shortMessage || e.message,
      });
    }
  }

  // Prove omitted live registry call still reverts
  const bad = encodeFunctionData({
    abi: [{ type: "function", name: "setOpsGateway", inputs: [{ type: "address" }] }],
    functionName: "setOpsGateway",
    args: [ready.deployed.gateway],
  });
  let liveReg;
  try {
    await publicClient.call({
      account: SAFE,
      to: ready.deployed.liveStrategyRegistry,
      data: bad,
    });
    liveReg = { ok: true, unexpected: true };
  } catch (e) {
    liveReg = { ok: false, expected: true, error: e.shortMessage || e.message };
  }

  const pending = await publicClient.readContract({
    address: TIMELOCK,
    abi: parseAbi(["function isOperationPending(bytes32) view returns (bool)"]),
    functionName: "isOperationPending",
    args: [ready.timelock.operationId],
  });

  const report = {
    revalidatedAt: new Date().toISOString(),
    scheduleBatchFromSafe: scheduleSim,
    innerCallsAsTimelock: innerSims,
    omittedLiveRegistrySetOpsGateway: liveReg,
    timelockMinDelay: delay.toString(),
    expectedDelay: DELAY,
    safeNonceOnChain: nonce.toString(),
    safeNonceInPayload: ready.transaction.nonce,
    nonceMatch: nonce.toString() === ready.transaction.nonce,
    safeThreshold: threshold.toString(),
    safeTxHash,
    safeTxHashMatch: safeTxHash.toLowerCase() === ready.safeTxHash.toLowerCase(),
    operationId: ready.timelock.operationId,
    isOperationPendingOnChain: pending,
    countdown: {
      startsWhen: "Safe executes Timelock.scheduleBatch on-chain (not at propose time)",
      activationUnix: "scheduleReceipt.block.timestamp + 172800",
      activationIso: "new Date((scheduleTs + 172800) * 1000).toISOString()",
      notScheduledYet: !pending,
    },
    readyToSignPath: OUT,
    signingSteps: [
      "Open https://app.safe.global/home?safe=base:0x356A4A432EE57F31F5cF8Fdd55F95c1FF6Cd5910",
      "New transaction → Transaction Builder / Contract interaction",
      `To: ${TIMELOCK}`,
      "Value: 0",
      "Data: paste transaction.data from ops-gateway-ready-to-sign.json (Call / operation 0)",
      "Collect 2-of-3 signatures and Execute on Safe (this mines scheduleBatch)",
      "Record schedule tx hash + block.timestamp; activation = timestamp + 172800",
      "After activation, submit afterDelayExecute (Timelock.executeBatch) via Safe",
      "Verify gateway.paused()===false and newExecutor.opsGateway===gateway",
      "Pin opsGateway + features.opsGatewayWithdraw=true only (keep opsGatewayDeposit=false until deposit stack Safe wiring)",
    ],
  };

  fs.writeFileSync(SIM_OUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!scheduleSim.ok || innerSims.some((x) => !x.ok) || !report.nonceMatch) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
