#!/usr/bin/env node
/**
 * Propose (1/2) Safe → Timelock scheduleBatch for exit-USDC cutover.
 * Does NOT execute Timelock (48h delay). Does NOT move user funds.
 *
 * Usage:
 *   node scripts/stable-club/propose-safe-timelock-exit-usdc.cjs --new-executor=0x... [--broadcast]
 *
 * Without --broadcast: prints Safe tx payload only.
 * With --broadcast: signs as Safe owner (deployer) and proposes to Safe Transaction Service.
 * A second Safe owner must confirm before the Timelock scheduleBatch lands on-chain.
 */
require("dotenv").config({ path: ".env.local" });
const { execFileSync } = require("child_process");
const {
  createWalletClient,
  createPublicClient,
  http,
  encodeFunctionData,
  hashTypedData,
  parseAbi,
} = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { base } = require("viem/chains");

const SAFE = "0x356A4A432EE57F31F5cF8Fdd55F95c1FF6Cd5910";
const TIMELOCK = "0x6A83733C829B6F8a9C0E0D4d5713D64eE959167a";
const SAFE_TX_SERVICE = "https://safe-transaction-base.safe.global";

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const broadcast = process.argv.includes("--broadcast");
const newExecutor = arg("new-executor");
if (!newExecutor || !/^0x[a-fA-F0-9]{40}$/.test(newExecutor)) {
  console.error(
    "Usage: node scripts/stable-club/propose-safe-timelock-exit-usdc.cjs --new-executor=0x... [--broadcast]",
  );
  process.exit(1);
}

const built = JSON.parse(
  execFileSync(
    process.execPath,
    ["scripts/stable-club/build-timelock-exit-usdc-ops.cjs", `--new-executor=${newExecutor}`],
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
  const pk = process.env.DEPLOYER_PRIVATE_KEY?.trim();
  if (!pk) throw new Error("DEPLOYER_PRIVATE_KEY required");
  const account = privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`);
  const publicClient = createPublicClient({
    chain: base,
    transport: http(process.env.BASE_RPC_URL),
  });

  const safeAbi = parseAbi([
    "function nonce() view returns (uint256)",
    "function getThreshold() view returns (uint256)",
    "function getOwners() view returns (address[])",
    "function domainSeparator() view returns (bytes32)",
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
  if (!owners.map((o) => o.toLowerCase()).includes(account.address.toLowerCase())) {
    throw new Error(`Signer ${account.address} is not a Safe owner`);
  }

  const to = TIMELOCK;
  const value = 0n;
  const data = built.safeTransaction.data;
  const operation = 0;
  const safeTxGas = 0n;
  const baseGas = 0n;
  const gasPrice = 0n;
  const gasToken = "0x0000000000000000000000000000000000000000";
  const refundReceiver = "0x0000000000000000000000000000000000000000";

  const safeTxHash = hashTypedData({
    domain: {
      chainId: 8453,
      verifyingContract: SAFE,
    },
    types: EIP712_SAFE_TX_TYPE,
    primaryType: "SafeTx",
    message: {
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
    },
  });

  const signature = await account.signTypedData({
    domain: {
      chainId: 8453,
      verifyingContract: SAFE,
    },
    types: EIP712_SAFE_TX_TYPE,
    primaryType: "SafeTx",
    message: {
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
    },
  });

  const proposal = {
    status: broadcast ? "PROPOSING_1_OF_2" : "CALLDATA_ONLY_NO_BROADCAST",
    safe: SAFE,
    timelock: TIMELOCK,
    newExecutor,
    threshold: threshold.toString(),
    nonce: nonce.toString(),
    safeTxHash,
    signer: account.address,
    signature,
    delaySeconds: built.delaySeconds,
    estimatedIfScheduledNowUtc: built.estimatedIfScheduledNowUtc,
    note:
      "After this Safe tx executes on-chain, Timelock scheduleBatch starts the 48h clock. Exact executeAt = scheduleReceipt.blockTimestamp + 172800.",
    safeTransactionServiceProposeBody: {
      to,
      value: value.toString(),
      data,
      operation,
      safeTxGas: safeTxGas.toString(),
      baseGas: baseGas.toString(),
      gasPrice: gasPrice.toString(),
      gasToken,
      refundReceiver,
      nonce: Number(nonce),
      contractTransactionHash: safeTxHash,
      sender: account.address,
      signature,
      origin: "INDEXLA exitAllToUsdc cutover",
    },
    reverseRoutes: built.reverseRoutes,
    scheduleBatchOpCount: built.scheduleBatch.targets.length,
  };

  if (!broadcast) {
    console.log(JSON.stringify(proposal, null, 2));
    return;
  }

  const url = `${SAFE_TX_SERVICE}/api/v1/safes/${SAFE}/multisig-transactions/`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(proposal.safeTransactionServiceProposeBody),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    console.error(JSON.stringify({ status: "PROPOSE_FAILED", httpStatus: res.status, body }, null, 2));
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        ...proposal,
        status: "PROPOSED_AWAITING_2ND_SAFE_SIGNATURE",
        safeServiceResponse: body,
        confirmUrl: `https://app.safe.global/transactions/queue?safe=base:${SAFE}`,
        remainingConfirmationsRequired: Number(threshold) - 1,
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
