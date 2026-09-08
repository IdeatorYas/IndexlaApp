/**
 * Propose ONE Safe MultiSendCallOnly tx that wires the new exit-percent
 * CL executor + adapters into the live shared stack.
 *
 * Usage:
 *   node scripts/stable-club/propose-exit-percent-cutover-multisend.cjs
 *   node scripts/stable-club/propose-exit-percent-cutover-multisend.cjs --broadcast
 *
 * Agent proposes (1-of-threshold). Remaining Safe owners must confirm & execute.
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
const guards = require("./base-mainnet-deploy-guards.cjs");

const SAFE = guards.MVP_SAFE;
const MULTI_SEND_CALL_ONLY = "0x9641d764fc13c8B624c04430C7356C1C7C8102e2";
const SAFE_TX_SERVICE = "https://safe-transaction-base.safe.global";

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
    "deployments/base-mainnet/exit-percent-cutover-approval-pack.json",
  );
  if (!fs.existsSync(packPath)) {
    throw new Error(
      `Missing ${packPath}. Run build-exit-percent-cutover-pack.cjs after CREATE.`,
    );
  }
  const pack = JSON.parse(fs.readFileSync(packPath, "utf8"));
  const configTxs = pack.safeTransactions;
  if (!Array.isArray(configTxs) || configTxs.length < 10) {
    throw new Error(`Unexpected config tx count: ${configTxs?.length}`);
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

  const to = MULTI_SEND_CALL_ONLY;
  const value = 0n;
  const data = multiSendData;
  const operation = 1; // DelegateCall for MultiSendCallOnly
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

  const confirmUrl = `https://app.safe.global/transactions/queue?safe=base:${SAFE}`;
  const proposal = {
    status: broadcast ? "PROPOSING_1_OF_THRESHOLD" : "CALLDATA_ONLY_NO_BROADCAST",
    purpose:
      "Exit-percent cutover: wire new CL executor+adapters (decreaseLiquidityTo) into live shared stack",
    safe: SAFE,
    multiSendCallOnly: MULTI_SEND_CALL_ONLY,
    operation: "DelegateCall",
    innerCallCount: configTxs.length,
    innerLabels: configTxs.map((t) => t.label),
    addresses: pack.addresses,
    compatibility: pack.compatibility,
    doNotEnableUntil: pack.doNotEnableUntil,
    threshold: threshold.toString(),
    nonce: nonce.toString(),
    safeTxHash,
    signer: account.address,
    signature,
    confirmUrl,
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
      origin: "INDEXLA exit-percent cutover MultiSend",
    },
  };

  const outPath = path.join(
    process.cwd(),
    "deployments/base-mainnet/exit-percent-cutover-multisend-proposal.json",
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
      JSON.stringify(
        { status: "PROPOSE_FAILED", httpStatus: res.status, body, artifact: outPath },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        ...proposal,
        status: "PROPOSED_AWAITING_REMAINING_SAFE_SIGNATURES",
        safeServiceResponse: body,
        confirmUrl,
        remainingConfirmationsRequired: Number(threshold) - 1,
        artifact: outPath,
        yourAction:
          "Open confirmUrl as remaining Safe owner(s) → review inner calls → confirm & execute. Do NOT enable exitPercentToUsdc until executed + verified.",
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
