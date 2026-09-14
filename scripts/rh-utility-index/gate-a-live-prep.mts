/**
 * Gate A live-prep — read-only: balances, buy estimateGas, simulated sell batch shape.
 * No broadcasts.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  encodeFunctionData,
  formatEther,
  http,
  maxUint256,
  parseEther,
  type Address,
  type Hex,
} from "viem";
import { robinhood } from "viem/chains";
import {
  BASKET,
  GATEWAY_ADDRESS,
  RH_CHAIN_ID,
  RH_RPC,
  buildBuyLegs,
  buildExitLegs,
  erc20Abi,
  gatewayAbi,
} from "../../src/lib/utility-index/constants.ts";
import {
  DEFAULT_SLIPPAGE_BPS,
  minOutMap,
  quoteBuyLegs,
  quoteSellLegs,
} from "../../src/lib/utility-index/quotes.ts";

const ACCOUNT = "0xcdf2be3c6f561d89a5b7041833f7f48d5a593a53" as Address;
const OUT = resolve("tmp/rh-utility-index-r2/gate-a");

async function main() {
  mkdirSync(OUT, { recursive: true });
  const client = createPublicClient({
    chain: { ...robinhood, id: RH_CHAIN_ID },
    transport: http(RH_RPC, { timeout: 90_000 }),
  });

  const ethBal = await client.getBalance({ address: ACCOUNT });
  const gasPrice = await client.getGasPrice();

  const balances = [];
  for (const t of BASKET) {
    const bal = await client.readContract({
      address: t.address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [ACCOUNT],
    });
    const allowance = await client.readContract({
      address: t.address,
      abi: erc20Abi,
      functionName: "allowance",
      args: [ACCOUNT, GATEWAY_ADDRESS],
    });
    balances.push({
      symbol: t.symbol,
      address: t.address,
      bal: bal.toString(),
      balFmt: formatEther(bal),
      allowance: allowance.toString(),
      allowanceIsZero: allowance === 0n,
    });
  }

  const buyCandidates = ["0.0002", "0.00015", "0.0001", "0.00005"] as const;
  const buyEstimates = [];
  for (const ethIn of buyCandidates) {
    const value = parseEther(ethIn);
    const q = await quoteBuyLegs({
      client,
      grossEth: value,
      slippageBps: DEFAULT_SLIPPAGE_BPS,
    });
    if (!q.quotesOk) {
      buyEstimates.push({ ethIn, ok: false, errors: q.errors });
      continue;
    }
    const legs = buildBuyLegs(minOutMap(q.legs));
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
    const data = encodeFunctionData({
      abi: gatewayAbi,
      functionName: "depositFromEth",
      args: [legs.v3, legs.v2, legs.v4, deadline],
    });
    let gas: bigint | null = null;
    let gasErr: string | null = null;
    try {
      gas = await client.estimateGas({
        account: ACCOUNT,
        to: GATEWAY_ADDRESS,
        data,
        value,
      });
    } catch (e) {
      gasErr = String(e).slice(0, 400);
    }
    const fee = gas != null ? gas * gasPrice : null;
    const need = fee != null ? value + fee : null;
    buyEstimates.push({
      ethIn,
      ok: true,
      investableEth: formatEther(q.investableEth),
      activeLegs: q.activeLegCount,
      estimateGas: gas?.toString() ?? null,
      gasErr,
      estFeeEth: fee != null ? formatEther(fee) : null,
      needEth: need != null ? formatEther(need) : null,
      affordable: need != null ? ethBal >= need : false,
      leftoverEth: need != null && ethBal >= need ? formatEther(ethBal - need) : null,
      taxNotes: q.taxNotes,
    });
  }

  const recommended =
    buyEstimates.find((b) => b.ok && b.affordable && b.ethIn === "0.0002") ??
    buyEstimates.find((b) => b.ok && b.affordable) ??
    null;

  // Hypothetical post-buy sell batch shape (equal-weight proxy from buy quote mins).
  // Exact post-buy amounts unknown until receipt; cold wallet → 8 approves + exit.
  const approveCalldata = encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [GATEWAY_ADDRESS, maxUint256],
  });
  const batchTemplate = {
    version: "2.0.0",
    from: ACCOUNT,
    chainId: `0x${RH_CHAIN_ID.toString(16)}`,
    atomicRequired: true,
    callCount: 9,
    calls: [
      ...BASKET.map((t) => ({
        to: t.address,
        data: approveCalldata,
        value: "0x0",
        purpose: `approve ${t.symbol} -> gateway maxUint256`,
      })),
      {
        to: GATEWAY_ADDRESS,
        data: "0xexitPercentToEth(50% — built at click with fresh quotes)" as Hex | string,
        value: "0x0",
        purpose: "exitPercentToEth 5000 bps",
      },
    ],
    honesty:
      'atomic.status="ready" is capability discovery only — not proven wallet_sendCalls execution',
  };

  // eth_call simulation of buy for recommended size (state change not persisted)
  let buySim: { ok: boolean; detail: string } | null = null;
  if (recommended?.ok && recommended.ethIn) {
    const value = parseEther(recommended.ethIn);
    const q = await quoteBuyLegs({
      client,
      grossEth: value,
      slippageBps: DEFAULT_SLIPPAGE_BPS,
    });
    if (q.quotesOk) {
      const legs = buildBuyLegs(minOutMap(q.legs));
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
      const data = encodeFunctionData({
        abi: gatewayAbi,
        functionName: "depositFromEth",
        args: [legs.v3, legs.v2, legs.v4, deadline],
      });
      try {
        await client.call({ account: ACCOUNT, to: GATEWAY_ADDRESS, data, value });
        buySim = { ok: true, detail: "eth_call depositFromEth succeeded (simulation only)" };
      } catch (e) {
        buySim = { ok: false, detail: String(e).slice(0, 500) };
      }
    }
  }

  const report = {
    preparedAt: new Date().toISOString(),
    gate: "A",
    account: ACCOUNT,
    chainId: RH_CHAIN_ID,
    gateway: GATEWAY_ADDRESS,
    capabilityNote:
      'User-reported wallet_getCapabilities atomic.status="ready" on 4663 — discovery only, not execution proof',
    ethBalance: { wei: ethBal.toString(), eth: formatEther(ethBal) },
    gasPrice: { wei: gasPrice.toString(), gwei: Number(gasPrice) / 1e9 },
    balances,
    coldWallet: balances.every((b) => b.bal === "0"),
    allAllowancesZero: balances.every((b) => b.allowanceIsZero),
    buyEstimates,
    recommendedBuyEth: recommended?.ethIn ?? null,
    recommendedBuy: recommended,
    buySimulation: buySim,
    firstSellPlan: {
      percent: 50,
      method: "wallet_sendCalls",
      atomicRequired: true,
      noSequentialFallback: true,
      expectedCalls: "8× approve(maxUint256) + 1× exitPercentToEth(5000 bps)",
      expectedUserPromptsIfAtomicWorks: "≤3 (ideally 1 batch confirmation)",
      batchTemplate,
    },
    remainderSellPlan: {
      percent: 100,
      note: "After first 50% atomic sell succeeds and allowances are warm, remainder sell should be 1× exit only (still via atomic path if any approve missing)",
    },
  };

  const outPath = resolve(OUT, "live-prep-cdf2be3c.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log("WROTE", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
