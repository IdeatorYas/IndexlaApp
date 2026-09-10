#!/usr/bin/env node
/**
 * After Safe executes step1 scheduleBatch, report schedule tx + exact unlock time.
 *
 *   node scripts/stable-club/report-ops-gateway-schedule-status.cjs
 */
require("./load-local-env.cjs").loadLocalEnv();
const fs = require("fs");
const path = require("path");
const { createPublicClient, http, parseAbi, getAddress } = require("viem");
const { base } = require("viem/chains");

const READY = path.join(
  __dirname,
  "../../deployments/base-mainnet/ops-gateway-ready-to-sign.json",
);
const OUT = path.join(
  __dirname,
  "../../deployments/base-mainnet/ops-gateway-schedule-status.json",
);

async function main() {
  const ready = JSON.parse(fs.readFileSync(READY, "utf8"));
  const publicClient = createPublicClient({
    chain: base,
    transport: http(process.env.BASE_RPC_URL),
  });
  const TL = getAddress(ready.timelock.address);
  const opId = ready.timelock.operationId;
  const abi = parseAbi([
    "function isOperationPending(bytes32) view returns (bool)",
    "function isOperationReady(bytes32) view returns (bool)",
    "function isOperationDone(bytes32) view returns (bool)",
    "function getTimestamp(bytes32) view returns (uint256)",
    "event CallScheduled(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data, bytes32 predecessor, uint256 delay)",
  ]);

  const pending = await publicClient.readContract({
    address: TL,
    abi,
    functionName: "isOperationPending",
    args: [opId],
  });
  const readyOp = await publicClient.readContract({
    address: TL,
    abi,
    functionName: "isOperationReady",
    args: [opId],
  });
  const done = await publicClient.readContract({
    address: TL,
    abi,
    functionName: "isOperationDone",
    args: [opId],
  });
  const unlockTs = await publicClient.readContract({
    address: TL,
    abi,
    functionName: "getTimestamp",
    args: [opId],
  });

  let scheduleTxHash = null;
  let scheduledAt = null;
  if (pending || readyOp || done || unlockTs > 0n) {
    const latest = await publicClient.getBlockNumber();
    const from = latest > 2_000_000n ? latest - 2_000_000n : 0n;
    const logs = await publicClient.getLogs({
      address: TL,
      event: {
        type: "event",
        name: "CallScheduled",
        inputs: [
          { name: "id", type: "bytes32", indexed: true },
          { name: "index", type: "uint256", indexed: true },
          { name: "target", type: "address", indexed: false },
          { name: "value", type: "uint256", indexed: false },
          { name: "data", type: "bytes", indexed: false },
          { name: "predecessor", type: "bytes32", indexed: false },
          { name: "delay", type: "uint256", indexed: false },
        ],
      },
      args: { id: opId },
      fromBlock: from,
      toBlock: "latest",
    });
    if (logs.length > 0) {
      scheduleTxHash = logs[0].transactionHash;
      const block = await publicClient.getBlock({ blockNumber: logs[0].blockNumber });
      scheduledAt = Number(block.timestamp);
    }
  }

  const unlock = Number(unlockTs);
  const report = {
    checkedAt: new Date().toISOString(),
    operationId: opId,
    pending,
    ready: readyOp,
    done,
    scheduleTxHash,
    scheduledAtUnix: scheduledAt,
    scheduledAtIso: scheduledAt ? new Date(scheduledAt * 1000).toISOString() : null,
    unlockUnix: unlock > 0 ? unlock : null,
    unlockIso: unlock > 0 ? new Date(unlock * 1000).toISOString() : null,
    unlockInSeconds:
      unlock > 0 ? Math.max(0, unlock - Math.floor(Date.now() / 1000)) : null,
    note:
      unlock === 0
        ? "Not scheduled yet — execute Safe step1 scheduleBatch first."
        : "Countdown started at schedule mining; executeBatch allowed at unlockIso.",
  };
  fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
