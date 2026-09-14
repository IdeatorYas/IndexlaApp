/**
 * Gate A live-prep (fast) — balances + one buy estimateGas + batch shape.
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
} from "viem";
import { robinhood } from "viem/chains";
import {
  BASKET,
  GATEWAY_ADDRESS,
  RH_CHAIN_ID,
  RH_RPC,
  buildBuyLegs,
  erc20Abi,
  gatewayAbi,
} from "../../src/lib/utility-index/constants.ts";
import {
  DEFAULT_SLIPPAGE_BPS,
  minOutMap,
  quoteBuyLegs,
} from "../../src/lib/utility-index/quotes.ts";

const ACCOUNT = "0xcdf2be3c6f561d89a5b7041833f7f48d5a593a53" as Address;
const BUY = "0.0002";
const OUT = resolve("tmp/rh-utility-index-r2/gate-a");

async function main() {
  console.log("start", new Date().toISOString());
  mkdirSync(OUT, { recursive: true });
  const client = createPublicClient({
    chain: { ...robinhood, id: RH_CHAIN_ID },
    transport: http(RH_RPC, { timeout: 45_000 }),
  });

  console.log("reading eth + gas…");
  const ethBal = await client.getBalance({ address: ACCOUNT });
  const gasPrice = await client.getGasPrice();
  console.log("eth", formatEther(ethBal), "gasPrice", gasPrice.toString());

  console.log("reading balances/allowances…");
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
      bal: bal.toString(),
      balFmt: formatEther(bal),
      allowance: allowance.toString(),
      allowanceIsZero: allowance === 0n,
    });
    console.log(t.symbol, formatEther(bal), "allow", allowance.toString());
  }

  console.log("quoting buy", BUY, "…");
  const value = parseEther(BUY);
  const q = await quoteBuyLegs({
    client,
    grossEth: value,
    slippageBps: DEFAULT_SLIPPAGE_BPS,
  });
  console.log("quotesOk", q.quotesOk, "active", q.activeLegCount, "errors", q.errors);

  let estimateGas: string | null = null;
  let gasErr: string | null = null;
  let ethCallOk: boolean | null = null;
  let ethCallErr: string | null = null;
  let feeEth: string | null = null;
  let needEth: string | null = null;
  let affordable = false;

  if (q.quotesOk) {
    const legs = buildBuyLegs(minOutMap(q.legs));
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
    const data = encodeFunctionData({
      abi: gatewayAbi,
      functionName: "depositFromEth",
      args: [legs.v3, legs.v2, legs.v4, deadline],
    });
    try {
      console.log("estimateGas…");
      const gas = await client.estimateGas({
        account: ACCOUNT,
        to: GATEWAY_ADDRESS,
        data,
        value,
      });
      estimateGas = gas.toString();
      const fee = gas * gasPrice;
      feeEth = formatEther(fee);
      needEth = formatEther(value + fee);
      affordable = ethBal >= value + fee;
      console.log("gas", estimateGas, "fee", feeEth, "need", needEth, "affordable", affordable);
    } catch (e) {
      gasErr = String(e).slice(0, 500);
      console.log("estimateGas fail", gasErr);
    }
    try {
      console.log("eth_call sim…");
      await client.call({ account: ACCOUNT, to: GATEWAY_ADDRESS, data, value });
      ethCallOk = true;
      console.log("eth_call ok");
    } catch (e) {
      ethCallOk = false;
      ethCallErr = String(e).slice(0, 500);
      console.log("eth_call fail", ethCallErr);
    }
  }

  const approveData = encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [GATEWAY_ADDRESS, maxUint256],
  });

  const report = {
    preparedAt: new Date().toISOString(),
    account: ACCOUNT,
    chainId: RH_CHAIN_ID,
    gateway: GATEWAY_ADDRESS,
    capabilityNote:
      'User reported atomic.status="ready" — capability discovery only, not execution proof',
    ethBalanceEth: formatEther(ethBal),
    gasPriceWei: gasPrice.toString(),
    gasPriceGwei: Number(gasPrice) / 1e9,
    balances,
    coldWallet: balances.every((b) => b.bal === "0"),
    allAllowancesZero: balances.every((b) => b.allowanceIsZero),
    proposedBuyEth: BUY,
    buyQuote: {
      ok: q.quotesOk,
      activeLegs: q.activeLegCount,
      investableEth: q.quotesOk ? formatEther(q.investableEth) : null,
      errors: q.errors,
      taxNotes: q.taxNotes,
      estimateGas,
      gasErr,
      estFeeEth: feeEth,
      needEth,
      affordable,
      leftoverEth:
        affordable && needEth
          ? formatEther(ethBal - parseEther(needEth as `${number}`))
          : null,
      ethCallOk,
      ethCallErr,
    },
    atomicBatchShape: {
      method: "wallet_sendCalls",
      version: "2.0.0",
      from: ACCOUNT,
      chainId: `0x${RH_CHAIN_ID.toString(16)}`,
      atomicRequired: true,
      expectedCallsAfterBuy: 9,
      calls: [
        ...BASKET.map((t) => ({
          to: t.address,
          data: approveData,
          value: "0x0",
          purpose: `approve ${t.symbol}`,
        })),
        {
          to: GATEWAY_ADDRESS,
          purpose: "exitPercentToEth 50% (fresh quote calldata at click)",
          value: "0x0",
        },
      ],
    },
    pageClicks: {
      url: "https://app.indexla.tech/app/utility-index",
      step1: `Enter ${BUY} in ETH amount → click "Buy basket"`,
      step2:
        'After buy confirms and balances show → click "Gate A · Sell 50% atomic only (wallet_sendCalls)"',
      step3:
        'After 50% settles → set slider 100% or click Gate A again after confirming remaining balances; prefer warm exit (allowances set). For remainder use Gate A button again once balances refresh (will batch exit-only if approvals already max).',
      doNotClick: "Sell N% (sequential · may be up to 9 prompts)",
    },
  };

  // fix leftover with bigint
  if (affordable && estimateGas) {
    const fee = BigInt(estimateGas) * gasPrice;
    report.buyQuote.leftoverEth = formatEther(ethBal - value - fee);
  } else {
    report.buyQuote.leftoverEth = null;
  }

  const outPath = resolve(OUT, "live-prep-cdf2be3c.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log("WROTE", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
