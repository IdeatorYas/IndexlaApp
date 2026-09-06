import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  createPublicClient,
  http,
  parseAbiItem,
  formatUnits,
  getAddress,
  decodeFunctionData,
  toFunctionSelector,
  parseAbi,
  fallback,
} from "viem";
import { base } from "viem/chains";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..");
try {
  const env = fs.readFileSync(path.join(root, ".env.local"), "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    const v = m[2].trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
} catch {}

const WALLET = getAddress("0xab4e242C5b489e8301408C93003903364214559F");
const EXEC = getAddress("0x1cdE442a760Ddda54087081aF9860471Dc099a9f");
const DEPOSIT_TX =
  "0x87f01652b3716c94be2f1cdb9bb0a9a4c6c2559c57b65a5b27ae884e51970d7b";
const TOKENS = {
  USDC: { address: getAddress("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"), decimals: 6 },
  cbBTC: { address: getAddress("0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf"), decimals: 8 },
  WETH: { address: getAddress("0x4200000000000000000000000000000000000006"), decimals: 18 },
};

const qn =
  process.env.BASE_RPC_URL ||
  process.env.QUICKNODE_HTTP_URL ||
  process.env.QUICKNODE_URL;
const publicRpc = process.env.BASE_RPC_FALLBACK_URL || "https://mainnet.base.org";

const client = createPublicClient({
  chain: base,
  transport: fallback([http(publicRpc, { timeout: 60_000 }), http(qn, { timeout: 60_000 })]),
});

const strategyLegExited = parseAbiItem(
  "event StrategyLegExited(bytes32 indexed strategyId, uint8 legIndex, bytes32 poolId, uint256 positionTokenId, bool emergency)",
);
const exitAllAbi = parseAbi([
  "function exitAll(bytes32 strategyId, (uint8 legIndex, address adapter, address tokenA, address tokenB, uint256 positionTokenId, uint128 liquidity, uint256 amountAMin, uint256 amountBMin, uint256 slippageBps, bool fullExit)[5] legs, uint256 executionNonceBase)",
]);
const balanceOfAbi = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const exitAllSel = toFunctionSelector(
  "exitAll(bytes32,(uint8,address,address,address,uint256,uint128,uint256,uint256,uint256,bool)[5],uint256)",
);

const depositReceipt = await client.getTransactionReceipt({ hash: DEPOSIT_TX });
const fromBlock = depositReceipt.blockNumber;
const latest = await client.getBlockNumber();
console.log({
  depositBlock: fromBlock.toString(),
  latest: latest.toString(),
  span: (latest - fromBlock).toString(),
  exitAllSel,
});

// Prefer public RPC larger ranges; chunk by 2k if needed
const CHUNK = 2000n;
const exitTxHashes = new Set();
const exitLogs = [];

for (let start = fromBlock; start <= latest; start += CHUNK) {
  const end = start + CHUNK - 1n > latest ? latest : start + CHUNK - 1n;
  try {
    const logs = await client.getLogs({
      address: EXEC,
      event: strategyLegExited,
      fromBlock: start,
      toBlock: end,
    });
    console.log(`logs ${start}-${end}: ${logs.length}`);
    for (const l of logs) {
      exitTxHashes.add(l.transactionHash);
      exitLogs.push(l);
    }
  } catch (e) {
    console.log(`chunk fail ${start}-${end}:`, e.shortMessage || e.message);
    // fallback 5-block windows
    for (let b = start; b <= end; b += 5n) {
      const to = b + 4n > end ? end : b + 4n;
      try {
        const logs = await client.getLogs({
          address: EXEC,
          event: strategyLegExited,
          fromBlock: b,
          toBlock: to,
        });
        for (const l of logs) {
          exitTxHashes.add(l.transactionHash);
          exitLogs.push(l);
        }
        if (logs.length) console.log(`  hit ${b}-${to}: ${logs.length}`);
      } catch (e2) {
        /* continue */
      }
    }
  }
}

console.log("exit txs", [...exitTxHashes]);

for (const hash of exitTxHashes) {
  const tx = await client.getTransaction({ hash });
  const receipt = await client.getTransactionReceipt({ hash });
  let decoded = null;
  try {
    decoded = decodeFunctionData({ abi: exitAllAbi, data: tx.input });
  } catch (e) {
    decoded = { error: String(e.message || e) };
  }

  const transferTopic =
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const received = [];
  for (const log of receipt.logs) {
    if (log.topics[0] !== transferTopic || log.topics.length < 3) continue;
    const token = getAddress(log.address);
    const meta = Object.entries(TOKENS).find(([, m]) => m.address === token);
    if (!meta) continue;
    const [sym, m] = meta;
    const to = getAddress(`0x${log.topics[2].slice(26)}`);
    const from = getAddress(`0x${log.topics[1].slice(26)}`);
    if (to !== WALLET) continue;
    const value = BigInt(log.data);
    received.push({
      symbol: sym,
      from,
      amount: formatUnits(value, m.decimals),
      raw: value.toString(),
    });
  }

  const aggregated = {};
  for (const r of received) {
    aggregated[r.symbol] = (BigInt(aggregated[r.symbol] || "0") + BigInt(r.raw)).toString();
  }
  const aggregatedHuman = {};
  for (const [sym, raw] of Object.entries(aggregated)) {
    aggregatedHuman[sym] = formatUnits(BigInt(raw), TOKENS[sym].decimals);
  }

  const legEvents = exitLogs
    .filter((l) => l.transactionHash === hash)
    .map((l) => ({
      legIndex: Number(l.args.legIndex),
      tokenId: l.args.positionTokenId.toString(),
      emergency: l.args.emergency,
      poolId: l.args.poolId,
    }));

  console.log(
    JSON.stringify(
      {
        hash,
        from: getAddress(tx.from),
        to: tx.to ? getAddress(tx.to) : null,
        methodId: tx.input.slice(0, 10),
        isExitAll: tx.input.toLowerCase().startsWith(exitAllSel.toLowerCase()),
        status: receipt.status,
        block: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString(),
        legs: legEvents,
        receivedByWallet: received,
        aggregatedHuman,
        functionName: decoded?.functionName ?? null,
      },
      null,
      2,
    ),
  );
}

console.log("\nbalances");
for (const [sym, m] of Object.entries(TOKENS)) {
  const [w, e] = await Promise.all([
    client.readContract({
      address: m.address,
      abi: balanceOfAbi,
      functionName: "balanceOf",
      args: [WALLET],
    }),
    client.readContract({
      address: m.address,
      abi: balanceOfAbi,
      functionName: "balanceOf",
      args: [EXEC],
    }),
  ]);
  console.log(sym, "wallet", formatUnits(w, m.decimals), "executor", formatUnits(e, m.decimals));
}
