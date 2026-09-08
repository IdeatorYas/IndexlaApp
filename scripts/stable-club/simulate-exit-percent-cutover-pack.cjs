/**
 * Decode + eth_call-simulate all 18 exit-percent Safe MultiSend inner calls
 * against live Base (as msg.sender = Safe). No broadcast.
 *
 *   node scripts/stable-club/simulate-exit-percent-cutover-pack.cjs
 */
require("dotenv").config({ path: ".env.local" });
const fs = require("fs");
const path = require("path");
const {
  createPublicClient,
  http,
  parseAbi,
  decodeFunctionData,
  getAddress,
} = require("viem");
const { base } = require("viem/chains");

const SAFE = "0x356A4A432EE57F31F5cF8Fdd55F95c1FF6Cd5910";
const MULTI_SEND = "0x9641d764fc13c8B624c04430C7356C1C7C8102e2";

const METHOD_ABI = parseAbi([
  "function setOperator(address operator, bool approved)",
  "function setExecutorApproved(address executor, bool approved)",
  "function setPermit2(address permit2_)",
  "function setTokenApproval(address token, bool approved)",
  "function setAdapterApproval(address adapter, bool approved)",
  "function registerPool(bytes32 poolId, address adapter)",
  "function owner() view returns (address)",
  "function operators(address) view returns (bool)",
  "function approvedExecutors(address) view returns (bool)",
  "function permit2() view returns (address)",
  "function approvedTokens(address) view returns (bool)",
  "function approvedAdapters(address) view returns (bool)",
  "function poolAdapters(bytes32) view returns (address)",
]);

async function main() {
  const packPath = path.join(
    process.cwd(),
    "deployments/base-mainnet/exit-percent-cutover-approval-pack.json",
  );
  const pack = JSON.parse(fs.readFileSync(packPath, "utf8"));
  const client = createPublicClient({
    chain: base,
    transport: http(process.env.BASE_RPC_URL),
  });

  const safeAbi = parseAbi([
    "function getOwners() view returns (address[])",
    "function getThreshold() view returns (uint256)",
    "function nonce() view returns (uint256)",
  ]);
  const owners = await client.readContract({
    address: SAFE,
    abi: safeAbi,
    functionName: "getOwners",
  });
  const threshold = await client.readContract({
    address: SAFE,
    abi: safeAbi,
    functionName: "getThreshold",
  });
  const nonce = await client.readContract({
    address: SAFE,
    abi: safeAbi,
    functionName: "nonce",
  });

  const clOwner = await client.readContract({
    address: pack.addresses.newClExecutor,
    abi: METHOD_ABI,
    functionName: "owner",
  });

  const results = [];
  for (const [i, tx] of pack.safeTransactions.entries()) {
    const to = getAddress(tx.to);
    let decoded;
    try {
      decoded = decodeFunctionData({
        abi: METHOD_ABI,
        data: tx.data,
      });
    } catch (e) {
      decoded = { error: String(e.message || e) };
    }

    // Pre-state reads (best-effort)
    let pre = {};
    try {
      if (decoded.functionName === "setOperator") {
        pre.alreadyOperator = await client.readContract({
          address: to,
          abi: METHOD_ABI,
          functionName: "operators",
          args: [decoded.args[0]],
        });
        pre.owner = await client.readContract({
          address: to,
          abi: METHOD_ABI,
          functionName: "owner",
        });
      } else if (decoded.functionName === "setExecutorApproved") {
        pre.alreadyApproved = await client.readContract({
          address: to,
          abi: METHOD_ABI,
          functionName: "approvedExecutors",
          args: [decoded.args[0]],
        });
        pre.owner = await client.readContract({
          address: to,
          abi: METHOD_ABI,
          functionName: "owner",
        });
      } else if (decoded.functionName === "setPermit2") {
        pre.currentPermit2 = await client.readContract({
          address: to,
          abi: METHOD_ABI,
          functionName: "permit2",
        });
        pre.owner = await client.readContract({
          address: to,
          abi: METHOD_ABI,
          functionName: "owner",
        });
      } else if (decoded.functionName === "setTokenApproval") {
        pre.alreadyApproved = await client.readContract({
          address: to,
          abi: METHOD_ABI,
          functionName: "approvedTokens",
          args: [decoded.args[0]],
        });
        pre.owner = await client.readContract({
          address: to,
          abi: METHOD_ABI,
          functionName: "owner",
        });
      } else if (decoded.functionName === "setAdapterApproval") {
        pre.alreadyApproved = await client.readContract({
          address: to,
          abi: METHOD_ABI,
          functionName: "approvedAdapters",
          args: [decoded.args[0]],
        });
        pre.owner = await client.readContract({
          address: to,
          abi: METHOD_ABI,
          functionName: "owner",
        });
      } else if (decoded.functionName === "registerPool") {
        pre.currentAdapter = await client.readContract({
          address: to,
          abi: METHOD_ABI,
          functionName: "poolAdapters",
          args: [decoded.args[0]],
        });
        pre.owner = await client.readContract({
          address: to,
          abi: METHOD_ABI,
          functionName: "owner",
        });
      }
    } catch (e) {
      pre.readError = String(e.shortMessage || e.message || e).slice(0, 200);
    }

    let simulation = { ok: false };
    try {
      await client.call({
        account: SAFE,
        to,
        data: tx.data,
        value: 0n,
      });
      simulation = { ok: true, eth_call: "success" };
    } catch (e) {
      simulation = {
        ok: false,
        eth_call: "revert",
        reason: String(e.shortMessage || e.message || e).slice(0, 400),
      };
    }

    results.push({
      index: i,
      label: tx.label,
      to,
      operation: tx.operation,
      value: tx.value,
      method: decoded.functionName || null,
      args: decoded.args
        ? decoded.args.map((a) => (typeof a === "bigint" ? a.toString() : a))
        : decoded.error || null,
      data: tx.data,
      pre,
      ownerIsSafe:
        pre.owner && String(pre.owner).toLowerCase() === SAFE.toLowerCase(),
      simulation,
    });

    await new Promise((r) => setTimeout(r, 120));
  }

  const allOk = results.every((r) => r.simulation.ok);
  const out = {
    simulatedAt: new Date().toISOString(),
    chainId: 8453,
    safe: {
      address: SAFE,
      owners,
      ownerCount: owners.length,
      threshold: Number(threshold),
      nonce: Number(nonce),
      governanceNote:
        "On-chain is 2-of-3 (3 owners, threshold 2). '1-of-2' earlier meant 1 confirmation already collected toward the threshold of 2 — not a 1-of-2 Safe.",
    },
    timelock: {
      appliesToThisCutover: false,
      reason:
        "This proposal targets MultiSendCallOnly via Safe Direct (operation=DelegateCall). It does NOT call TimelockController.schedule/execute. A stale Timelock scheduleBatch may still appear in the Safe queue at nonce 0 — ignore it; current Safe nonce is past 0.",
      multiSendCallOnly: MULTI_SEND,
    },
    newClExecutor: {
      address: pack.addresses.newClExecutor,
      owner: clOwner,
      ownerIsSafe: String(clOwner).toLowerCase() === SAFE.toLowerCase(),
    },
    previousClExecutor: pack.addresses.previousClExecutor,
    summary: {
      callCount: results.length,
      allSimulationsOk: allOk,
      failCount: results.filter((r) => !r.simulation.ok).length,
    },
    calls: results,
  };

  const outPath = path.join(
    process.cwd(),
    "deployments/base-mainnet/exit-percent-cutover-simulation.json",
  );
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  if (!allOk) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
