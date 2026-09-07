#!/usr/bin/env node
/**
 * Propose + poll + execute Safe setMaxGasPriceWei(100 gwei).
 * Exact reviewed calldata from deployments/base-mainnet/set-max-gas-price-100-gwei-safe-tx.json
 *
 * Usage:
 *   node scripts/stable-club/propose-execute-max-gas-100-gwei.cjs
 */
require("dotenv").config({ path: ".env.local" });
const fs = require("fs");
const path = require("path");
const {
  createPublicClient,
  createWalletClient,
  http,
  hashTypedData,
  parseAbi,
  encodeFunctionData,
} = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { base } = require("viem/chains");

const SAFE = "0x356A4A432EE57F31F5cF8Fdd55F95c1FF6Cd5910";
const SAFETY = "0x429df0c70eEfCC5CD6b8B8FB94Ca8eDe226feDe5";
const CALLDATA =
  "0x4d86fc56000000000000000000000000000000000000000000000000000000174876e800";
const EXPECTED_MAX = 100000000000n;
const SAFE_TX_SERVICE = "https://safe-transaction-base.safe.global";

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const pack = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "deployments/base-mainnet/set-max-gas-price-100-gwei-safe-tx.json"),
      "utf8",
    ),
  );
  if (pack.target.calldata.toLowerCase() !== CALLDATA.toLowerCase()) {
    throw new Error("Calldata mismatch vs reviewed proposal file");
  }

  const pk = process.env.DEPLOYER_PRIVATE_KEY?.trim();
  if (!pk) throw new Error("DEPLOYER_PRIVATE_KEY required");
  const account = privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`);
  const rpcCandidates = [
    process.env.SAFE_OPS_RPC_URL?.trim(),
    process.env.BASE_RPC_FALLBACK_URL?.trim(),
    "https://base.llamarpc.com",
    "https://1rpc.io/base",
    "https://base.meowrpc.com",
    "https://mainnet.base.org",
    process.env.BASE_RPC_URL?.trim(),
  ].filter(Boolean);

  let publicClient = null;
  let walletClient = null;
  let rpcUrl = null;
  let lastErr = null;
  for (const url of rpcCandidates) {
    try {
      const client = createPublicClient({
        chain: base,
        transport: http(url, { timeout: 45_000, retryCount: 2 }),
      });
      await client.getBlockNumber();
      publicClient = client;
      walletClient = createWalletClient({
        account,
        chain: base,
        transport: http(url, { timeout: 60_000, retryCount: 2 }),
      });
      rpcUrl = url;
      break;
    } catch (e) {
      lastErr = e.message || String(e);
    }
  }
  if (!publicClient || !walletClient || !rpcUrl) {
    throw new Error(`No working Base RPC. Last error: ${lastErr}`);
  }
  console.log(JSON.stringify({ phase: "rpc", host: (rpcUrl.match(/https?:\/\/([^/]+)/) || [])[1] }));
  await sleep(800);

  const safeAbi = parseAbi([
    "function nonce() view returns (uint256)",
    "function getThreshold() view returns (uint256)",
    "function getOwners() view returns (address[])",
    "function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,bytes signatures) payable returns (bool)",
    "function getTransactionHash(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 _nonce) view returns (bytes32)",
    "function approvedHashes(address owner, bytes32 txHash) view returns (uint256)",
  ]);
  const safetyAbi = parseAbi([
    "function maxGasPriceWei() view returns (uint256)",
    "function owner() view returns (address)",
  ]);

  await sleep(500);
  const before = await publicClient.readContract({
    address: SAFETY,
    abi: safetyAbi,
    functionName: "maxGasPriceWei",
  });
  await sleep(500);
  const owner = await publicClient.readContract({
    address: SAFETY,
    abi: safetyAbi,
    functionName: "owner",
  });
  if (owner.toLowerCase() !== SAFE.toLowerCase()) {
    throw new Error(`SafetyController owner ${owner} != Safe ${SAFE}`);
  }

  await sleep(500);
  const nonce = await publicClient.readContract({
    address: SAFE,
    abi: safeAbi,
    functionName: "nonce",
  });
  await sleep(500);
  const threshold = await publicClient.readContract({
    address: SAFE,
    abi: safeAbi,
    functionName: "getThreshold",
  });
  await sleep(500);
  const owners = await publicClient.readContract({
    address: SAFE,
    abi: safeAbi,
    functionName: "getOwners",
  });
  if (!owners.map((o) => o.toLowerCase()).includes(account.address.toLowerCase())) {
    throw new Error(`Signer ${account.address} is not a Safe owner`);
  }

  const to = SAFETY;
  const value = 0n;
  const data = CALLDATA;
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

  await sleep(800);
  const onChainHash = await publicClient.readContract({
    address: SAFE,
    abi: safeAbi,
    functionName: "getTransactionHash",
    args: [
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
    ],
  });

  const safeTxHash = hashTypedData({
    domain: { chainId: 8453, verifyingContract: SAFE },
    types: EIP712_SAFE_TX_TYPE,
    primaryType: "SafeTx",
    message,
  });

  if (safeTxHash.toLowerCase() !== onChainHash.toLowerCase()) {
    throw new Error(`EIP-712 hash ${safeTxHash} != on-chain getTransactionHash ${onChainHash}`);
  }

  const signature = await account.signTypedData({
    domain: { chainId: 8453, verifyingContract: SAFE },
    types: EIP712_SAFE_TX_TYPE,
    primaryType: "SafeTx",
    message,
  });

  const proposeBody = {
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
    origin: "INDEXLA setMaxGasPriceWei(100 gwei)",
  };

  console.log(
    JSON.stringify(
      {
        phase: "propose",
        beforeMaxGasPriceWei: before.toString(),
        safeTxHash,
        nonce: nonce.toString(),
        threshold: threshold.toString(),
        signer: account.address,
        calldata: CALLDATA,
      },
      null,
      2,
    ),
  );

  const proposeUrl = `${SAFE_TX_SERVICE}/api/v1/safes/${SAFE}/multisig-transactions/`;
  let proposeRes = await fetch(proposeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(proposeBody),
  });
  let proposeText = await proposeRes.text();
  let proposeJson;
  try {
    proposeJson = JSON.parse(proposeText);
  } catch {
    proposeJson = { raw: proposeText };
  }

  // 400 "already exists" is OK — continue to poll
  if (!proposeRes.ok && !(proposeRes.status === 400 && /already/i.test(proposeText))) {
    console.error(JSON.stringify({ phase: "propose_failed", status: proposeRes.status, body: proposeJson }, null, 2));
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        phase: "proposed",
        httpStatus: proposeRes.status,
        confirmUrl: `https://app.safe.global/transactions/queue?safe=base:${SAFE}`,
        safeTxHash,
      },
      null,
      2,
    ),
  );

  // Poll for confirmations (2-of-3)
  const detailUrl = `${SAFE_TX_SERVICE}/api/v1/multisig-transactions/${safeTxHash}/`;
  const pollUntil = Date.now() + 15 * 60 * 1000; // 15 min
  let detail = null;
  while (Date.now() < pollUntil) {
    const r = await fetch(detailUrl);
    const t = await r.text();
    try {
      detail = JSON.parse(t);
    } catch {
      detail = { raw: t };
    }
    const confs = detail.confirmations || [];
    const confCount = confs.length;
    const isExecuted = Boolean(detail.isExecuted);
    console.log(
      JSON.stringify({
        phase: "poll",
        confirmations: confCount,
        threshold: Number(threshold),
        isExecuted,
        signers: confs.map((c) => c.owner),
      }),
    );
    if (isExecuted) break;
    if (confCount >= Number(threshold)) break;
    await sleep(15_000);
  }

  if (!detail) throw new Error("No Safe TX service detail");

  if (detail.isExecuted) {
    const after = await publicClient.readContract({
      address: SAFETY,
      abi: safetyAbi,
      functionName: "maxGasPriceWei",
    });
    console.log(
      JSON.stringify(
        {
          phase: "already_executed",
          transactionHash: detail.transactionHash,
          maxGasPriceWei: after.toString(),
          ok: after === EXPECTED_MAX,
        },
        null,
        2,
      ),
    );
    if (after !== EXPECTED_MAX) process.exit(2);
    return;
  }

  const confs = detail.confirmations || [];
  if (confs.length < Number(threshold)) {
    console.error(
      JSON.stringify(
        {
          phase: "awaiting_second_signature",
          confirmations: confs.length,
          threshold: Number(threshold),
          confirmUrl: `https://app.safe.global/transactions/queue?safe=base:${SAFE}`,
          safeTxHash,
          note: "Deployer (1/2) signed. Second Safe owner must confirm in Safe UI, then re-run or wait for this poller.",
        },
        null,
        2,
      ),
    );
    process.exit(3);
  }

  // Sort signatures by owner address ascending (Safe requirement)
  const sorted = [...confs].sort((a, b) =>
    a.owner.toLowerCase().localeCompare(b.owner.toLowerCase()),
  );
  const signatures = "0x" + sorted.map((c) => c.signature.replace(/^0x/, "")).join("");

  console.log(
    JSON.stringify({
      phase: "executing",
      confirmationCount: sorted.length,
      owners: sorted.map((c) => c.owner),
    }),
  );

  const execHash = await walletClient.writeContract({
    address: SAFE,
    abi: safeAbi,
    functionName: "execTransaction",
    args: [
      to,
      value,
      data,
      operation,
      safeTxGas,
      baseGas,
      gasPrice,
      gasToken,
      refundReceiver,
      signatures,
    ],
    account,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: execHash });
  const after = await publicClient.readContract({
    address: SAFETY,
    abi: safetyAbi,
    functionName: "maxGasPriceWei",
  });

  const result = {
    phase: "done",
    execTxHash: execHash,
    execStatus: receipt.status,
    beforeMaxGasPriceWei: before.toString(),
    afterMaxGasPriceWei: after.toString(),
    expected: EXPECTED_MAX.toString(),
    verified: after === EXPECTED_MAX,
    safeTxHash,
  };
  fs.writeFileSync(
    path.join(process.cwd(), "tmp/set-max-gas-100-gwei-result.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
  if (!result.verified || receipt.status !== "success") process.exit(2);
}

main().catch((e) => {
  console.error(JSON.stringify({ phase: "fatal", error: e.message || String(e) }));
  process.exit(1);
});
