#!/usr/bin/env node
/**
 * Print / optionally propose the Safe → Timelock scheduleBatch for Ops Gateway.
 * Default: dry-run (ready-to-sign payload + Safe nonce). Does NOT execute Timelock.
 *
 *   node scripts/stable-club/propose-ops-gateway-timelock.cjs
 *   node scripts/stable-club/propose-ops-gateway-timelock.cjs --broadcast
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
} = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { base } = require("viem/chains");

const SAFE = "0x356A4A432EE57F31F5cF8Fdd55F95c1FF6Cd5910";
const TIMELOCK = "0x6A83733C829B6F8a9C0E0D4d5713D64eE959167a";
const SAFE_TX_SERVICE = "https://safe-transaction-base.safe.global";
const OUT = path.join(
  __dirname,
  "../../deployments/base-mainnet/ops-gateway-ready-to-sign.json",
);

const broadcast = process.argv.includes("--broadcast");

const built = JSON.parse(
  execFileSync(
    process.execPath,
    ["scripts/stable-club/build-timelock-ops-gateway.cjs"],
    { encoding: "utf8" },
  ),
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
  const publicClient = createPublicClient({
    chain: base,
    transport: http(process.env.BASE_RPC_URL),
  });

  const safeAbi = parseAbi([
    "function nonce() view returns (uint256)",
    "function getThreshold() view returns (uint256)",
    "function getOwners() view returns (address[])",
  ]);

  const nonce = await publicClient.readContract({
    address: SAFE,
    abi: safeAbi,
    functionName: "nonce",
  });
  const threshold = await publicClient.readContract({
    address: SAFE,
    abi: safeAbi,
    functionName: "getThreshold",
  });
  const owners = await publicClient.readContract({
    address: SAFE,
    abi: safeAbi,
    functionName: "getOwners",
  });

  const to = TIMELOCK;
  const value = 0n;
  const data = built.readyToSignSafeTransaction.data;
  const operation = 0;
  const safeTxGas = 0n;
  const baseGas = 0n;
  const gasPrice = 0n;
  const gasToken = "0x0000000000000000000000000000000000000000";
  const refundReceiver = "0x0000000000000000000000000000000000000000";

  const message = {
    to,
    value,
    data,
    operation,
    safeTxGas,
    baseGas,
    gasPrice,
    gasToken,
    refundReceiver,
    nonce,
  };

  const safeTxHash = hashTypedData({
    domain: { chainId: 8453, verifyingContract: SAFE },
    types: EIP712_SAFE_TX_TYPE,
    primaryType: "SafeTx",
    message,
  });

  const ready = {
    chainId: 8453,
    safe: SAFE,
    threshold: threshold.toString(),
    nonce: nonce.toString(),
    owners,
    safeTxHash,
    transaction: {
      to,
      value: "0",
      data,
      operation,
      safeTxGas: "0",
      baseGas: "0",
      gasPrice: "0",
      gasToken,
      refundReceiver,
      nonce: nonce.toString(),
    },
    timelock: {
      address: TIMELOCK,
      delaySeconds: 172800,
      operationId: built.operationId,
      salt: built.salt,
      innerOps: built.innerOps,
    },
    deployed: built.deployed,
    omittedBecauseWouldRevert: built.omittedBecauseWouldRevert,
    afterDelayExecute: built.afterDelayExecuteSafeTransaction,
    uiImport: {
      safeAppUrl: `https://app.safe.global/transactions/tx-builder?safe=base:${SAFE}`,
      instruction:
        "New transaction → Contract interaction → to=Timelock, value=0, data=transaction.data (Call). 2-of-3 confirm. Wait 172800s then submit afterDelayExecute.",
    },
    featureFlagReminder:
      "features.opsGateway must stay false until Timelock execute + paused===false + Basescan verify",
  };

  fs.writeFileSync(OUT, `${JSON.stringify(ready, null, 2)}\n`);
  console.log(JSON.stringify({ dryRun: !broadcast, artifact: OUT, ...ready }, null, 2));

  if (!broadcast) {
    console.error(
      "\n[dry-run] Re-run with --broadcast to propose to Safe Transaction Service (1/2).",
    );
    return;
  }

  const pk = process.env.DEPLOYER_PRIVATE_KEY?.trim();
  if (!pk) throw new Error("DEPLOYER_PRIVATE_KEY required for --broadcast");
  const account = privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`);
  if (!owners.map((o) => o.toLowerCase()).includes(account.address.toLowerCase())) {
    throw new Error(`Signer ${account.address} is not a Safe owner`);
  }

  const signature = await account.signTypedData({
    domain: { chainId: 8453, verifyingContract: SAFE },
    types: EIP712_SAFE_TX_TYPE,
    primaryType: "SafeTx",
    message,
  });

  const body = {
    to,
    value: "0",
    data,
    operation,
    safeTxGas: "0",
    baseGas: "0",
    gasPrice: "0",
    gasToken,
    refundReceiver,
    nonce: nonce.toString(),
    contractTransactionHash: safeTxHash,
    sender: account.address,
    signature,
    origin: "INDEXLA Ops Gateway scheduleBatch",
  };

  const res = await fetch(
    `${SAFE_TX_SERVICE}/api/v1/safes/${SAFE}/multisig-transactions/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Safe TX service ${res.status}: ${text}`);
  }
  console.log(
    JSON.stringify(
      {
        proposed: true,
        safeTxHash,
        service: SAFE_TX_SERVICE,
        queueUrl: `https://app.safe.global/transactions/queue?safe=base:${SAFE}`,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
