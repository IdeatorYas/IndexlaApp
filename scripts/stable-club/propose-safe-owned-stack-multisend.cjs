#!/usr/bin/env node
/**
 * Propose ONE Safe MultiSendCallOnly tx at nonce 0 that:
 *  - supersedes pending Timelock scheduleBatch 0x649f22a3…
 *  - configures the entire Safe-owned P0-B stack (no Timelock)
 *
 * Usage:
 *   node scripts/stable-club/propose-safe-owned-stack-multisend.cjs
 *   node scripts/stable-club/propose-safe-owned-stack-multisend.cjs --broadcast
 */
require("dotenv").config({ path: ".env.local" });
const fs = require("fs");
const path = require("path");
const {
  createPublicClient,
  http,
  encodeFunctionData,
  encodePacked,
  hashTypedData,
  parseAbi,
  getAddress,
} = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { base } = require("viem/chains");

const SAFE = "0x356A4A432EE57F31F5cF8Fdd55F95c1FF6Cd5910";
const MULTI_SEND_CALL_ONLY = "0x9641d764fc13c8B624c04430C7356C1C7C8102e2";
const SAFE_TX_SERVICE = "https://safe-transaction-base.safe.global";
const SUPERSEDES =
  "0x649f22a30d1b501d36f316bcc4600f56627c3a3ecd58561479142bcd4d9bb5c4";

const broadcast = process.argv.includes("--broadcast");

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

function packMultiSendTransactions(txs) {
  // Gnosis Safe multiSend packed encoding (operation, to, value, dataLength, data)
  let packed = "0x";
  for (const tx of txs) {
    const data = tx.data.startsWith("0x") ? tx.data : `0x${tx.data}`;
    const dataBytes = data.slice(2);
    const chunk = encodePacked(
      ["uint8", "address", "uint256", "uint256", "bytes"],
      [0, getAddress(tx.to), BigInt(tx.value || 0), BigInt(dataBytes.length / 2), data],
    );
    packed += chunk.slice(2);
  }
  return packed;
}

async function main() {
  const packPath = path.join(
    process.cwd(),
    "deployments/base-mainnet/safe-owned-stack-approval-pack.json",
  );
  const pack = JSON.parse(fs.readFileSync(packPath, "utf8"));
  // Skip empty reject — MultiSend at nonce 0 itself supersedes Timelock proposal.
  const configTxs = pack.safeTransactions.filter(
    (t) => !(t.decoded?.method === "rejectTransaction" || t.data === "0x"),
  );
  if (configTxs.length < 30) {
    throw new Error(`Unexpected config tx count: ${configTxs.length}`);
  }

  const packed = packMultiSendTransactions(configTxs);
  const multiSendData = encodeFunctionData({
    abi: parseAbi(["function multiSend(bytes transactions)"]),
    functionName: "multiSend",
    args: [packed],
  });

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
  if (nonce !== 0n) {
    console.warn(
      JSON.stringify({
        warning: "Safe nonce is not 0 — Timelock supersede semantics may differ",
        nonce: nonce.toString(),
      }),
    );
  }

  const to = MULTI_SEND_CALL_ONLY;
  const value = 0n;
  const data = multiSendData;
  const operation = 1; // DelegateCall required for MultiSendCallOnly
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
  const domain = { chainId: 8453, verifyingContract: SAFE };

  const safeTxHash = hashTypedData({
    domain,
    types: EIP712_SAFE_TX_TYPE,
    primaryType: "SafeTx",
    message,
  });
  const signature = await account.signTypedData({
    domain,
    types: EIP712_SAFE_TX_TYPE,
    primaryType: "SafeTx",
    message,
  });

  const proposal = {
    status: broadcast ? "PROPOSING_1_OF_2" : "CALLDATA_ONLY_NO_BROADCAST",
    purpose: "P0-B Safe-owned stack FULL CONFIG as one MultiSend (no Timelock)",
    safe: SAFE,
    multiSendCallOnly: MULTI_SEND_CALL_ONLY,
    operation: "DelegateCall",
    innerCallCount: configTxs.length,
    innerLabels: configTxs.map((t) => t.label),
    supersedesSafeTxHash: SUPERSEDES,
    supersedeNote:
      "Executing this MultiSend at Safe nonce 0 invalidates the pending Timelock scheduleBatch proposal.",
    threshold: threshold.toString(),
    nonce: nonce.toString(),
    safeTxHash,
    signer: account.address,
    signature,
    depositsRemainDisabledUntilE2E: true,
    confirmUrl: `https://app.safe.global/transactions/queue?safe=base:${SAFE}`,
    safeTransaction: {
      to,
      value: "0",
      data,
      operation,
    },
    safeTransactionServiceProposeBody: {
      to,
      value: "0",
      data,
      operation,
      safeTxGas: "0",
      baseGas: "0",
      gasPrice: "0",
      gasToken,
      refundReceiver,
      nonce: Number(nonce),
      contractTransactionHash: safeTxHash,
      sender: account.address,
      signature,
      origin: "INDEXLA P0-B Safe-owned stack MultiSend config",
    },
  };

  const outPath = path.join(
    process.cwd(),
    "deployments/base-mainnet/safe-owned-stack-multisend-proposal.json",
  );
  fs.writeFileSync(outPath, JSON.stringify(proposal, null, 2));

  if (!broadcast) {
    console.log(JSON.stringify({ ...proposal, artifact: outPath }, null, 2));
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
    console.error(
      JSON.stringify({ status: "PROPOSE_FAILED", httpStatus: res.status, body, artifact: outPath }, null, 2),
    );
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        ...proposal,
        status: "PROPOSED_AWAITING_2ND_SAFE_SIGNATURE",
        safeServiceResponse: body,
        confirmUrl: proposal.confirmUrl,
        remainingConfirmationsRequired: Number(threshold) - 1,
        artifact: outPath,
        yourAction:
          "Open confirmUrl as a second Safe owner → confirm & execute the MultiSend (not the Timelock scheduleBatch). Then reply here.",
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
