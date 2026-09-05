/**
 * Live wallet 0xab4e… 20 USDC depositFivePoolStrategy must estimateGas without PSC.
 * Read-only — no broadcast.
 *
 * If the live Permit2 → CL Executor allowance is expired (short TTL), applies an
 * expiry-only stateOverride (same amount + nonce) so the deposit path can be
 * proven. The app re-prompts Permit2 approve before any real deposit write.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createPublicClient,
  encodeAbiParameters,
  encodeFunctionData,
  formatUnits,
  getAddress,
  http,
  keccak256,
  pad,
  parseAbi,
  parseAbiParameters,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { base } from "viem/chains";
import { concentratedLiquidityExecutorAbi } from "@/lib/stable-club/abis";
import { formatStableClubExecutionError } from "@/lib/stable-club/execution-errors";
import { createOracleGuardQuoteAdapter } from "@/lib/stable-club/five-pool-quotes";
import {
  FIVE_POOL_DEFAULT_DEADLINE_SEC,
  FIVE_POOL_DEFAULT_LP_SLIPPAGE_BPS,
  FIVE_POOL_DEFAULT_QUOTE_MAX_AGE_SEC,
  FIVE_POOL_DEFAULT_SWAP_SLIPPAGE_BPS,
  buildDepositFivePoolStrategyArgs,
} from "@/lib/stable-club/five-pool-deposit";
import {
  evaluateClFivePoolPermit2Readiness,
} from "@/lib/stable-club/five-pool-permit2";
import { OFFICIAL_STABLE_CLUB_BASE_POOLS } from "@/lib/stable-club/official-pools";
import { permit2AllowanceAbi } from "@/lib/stable-club/permit2";
import { readPoolSlot0States } from "@/lib/stable-club/pool-slot0";
import { buildFivePoolQuotePlan } from "@/lib/stable-club/quote-plan";
import { TRUSTED_PHASE2A_BASE_DEPLOYMENTS } from "@/lib/stable-club/trusted-phase2a-base-manifest";

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1]!]) {
      process.env[m[1]!] = m[2]!.trim().replace(/^["']|["']$/g, "");
    }
  }
}
loadEnvLocal();
mkdirSync(resolve("tmp"), { recursive: true });

const WALLET = getAddress("0xab4e242C5b489e8301408C93003903364214559F");
const STRATEGY_ID =
  "0x4609de22034515f4cef8423ccf3f9bf3340a52ddb880ecc95e892fccf9ca9eb3" as Hex;
const GROSS = 20n * 10n ** 6n;
const PERMIT2 = getAddress("0x000000000022D473030F116DDee9F6B43ac78BA3");
const hasRpc = Boolean(process.env.BASE_RPC_URL?.trim());

/** Permit2 `allowance` mapping is at storage slot 1 (Uniswap Permit2 on Base). */
function permit2AllowanceStorageSlot(
  owner: Address,
  token: Address,
  spender: Address,
): Hex {
  const s0 = keccak256(
    encodeAbiParameters(parseAbiParameters("address, uint256"), [owner, 1n]),
  );
  const s1 = keccak256(
    encodeAbiParameters(parseAbiParameters("address, bytes32"), [token, s0]),
  );
  return keccak256(
    encodeAbiParameters(parseAbiParameters("address, bytes32"), [spender, s1]),
  );
}

function packPermit2Allowance(amount: bigint, expiration: number, nonce: number): Hex {
  const packed =
    amount | (BigInt(expiration) << 160n) | (BigInt(nonce) << 208n);
  return pad(toHex(packed), { size: 32 });
}

describe.runIf(hasRpc)("live wallet 20 USDC estimateGas (PSC gate)", () => {
  it("estimateGas succeeds for exact wallet call after mint-min fix", async () => {
    const client = createPublicClient({
      chain: base,
      transport: http(process.env.BASE_RPC_URL),
    });
    const d = TRUSTED_PHASE2A_BASE_DEPLOYMENTS;
    const nowSec = Math.floor(Date.now() / 1000);
    const block = await client.getBlock({ blockTag: "latest" });
    const blockNow = Number(block.timestamp);

    const erc20AllowanceToPermit2 = await client.readContract({
      address: d.usdc,
      abi: parseAbi([
        "function allowance(address owner, address spender) view returns (uint256)",
      ]),
      functionName: "allowance",
      args: [WALLET, PERMIT2],
    });
    const p2 = await client.readContract({
      address: PERMIT2,
      abi: permit2AllowanceAbi,
      functionName: "allowance",
      args: [WALLET, d.usdc, d.clExecutor],
    });
    const allowances = {
      erc20AllowanceToPermit2,
      permit2AmountToExecutor: p2[0],
      permit2ExpirationToExecutor: Number(p2[1]),
    };
    const readiness = evaluateClFivePoolPermit2Readiness({
      requiredGrossUsdc: GROSS,
      nowSec: blockNow,
      allowances,
    });

    const quoteAdapter = createOracleGuardQuoteAdapter({
      publicClient: client as never,
      oracleGuard: d.oracleGuard,
      tokens: { usdc: d.usdc, cbbtc: d.cbbtc, weth: d.weth },
    });
    const bundle = await quoteAdapter.fetchQuotes({ grossUsdc: GROSS, nowSec });
    const slot0States = await readPoolSlot0States(client, "base", 8453);
    const adapters = d.adapters.map((a) => a.adapter) as [
      Address,
      Address,
      Address,
      Address,
      Address,
    ];
    const deadline = BigInt(nowSec + FIVE_POOL_DEFAULT_DEADLINE_SEC);
    const plan = buildFivePoolQuotePlan({
      grossUsdc: GROSS,
      adapters,
      currentTicks: slot0States.map((s) => s.tick),
      sqrtPriceX96PerPool: slot0States.map((s) => s.sqrtPriceX96),
      quotes: bundle.quotes,
      slippageBps: FIVE_POOL_DEFAULT_SWAP_SLIPPAGE_BPS,
      lpSlippageBps: FIVE_POOL_DEFAULT_LP_SLIPPAGE_BPS,
      deadline,
      nowSec,
      maxQuoteAgeSec: FIVE_POOL_DEFAULT_QUOTE_MAX_AGE_SEC,
    });

    // Guard: mins must not equal naive raw desired floors on aero CL100 (PSC root cause).
    const leg0 = plan.legs[0]!;
    expect(leg0.amountAMin).toBeLessThan(leg0.retainUsdc);
    expect(OFFICIAL_STABLE_CLUB_BASE_POOLS[0]!.id).toBe("USDC-cbBTC-AERO-CL100");

    const depositArgs = buildDepositFivePoolStrategyArgs({
      plan,
      adapters: d.adapters,
      strategyId: STRATEGY_ID,
      executionNonce: 1n,
      quoteBundle: bundle,
      nowSec,
      maxQuoteAgeSec: FIVE_POOL_DEFAULT_QUOTE_MAX_AGE_SEC,
      requireLiveQuotes: true,
    });

    const data = encodeFunctionData({
      abi: concentratedLiquidityExecutorAbi,
      functionName: "depositFivePoolStrategy",
      args: [
        depositArgs.strategyId,
        depositArgs.executionNonce,
        depositArgs.grossUsdc,
        depositArgs.poolIds,
        depositArgs.deadline,
        depositArgs.legs.map((leg) => ({
          legIndex: leg.legIndex,
          adapter: leg.adapter,
          tokenA: leg.tokenA,
          tokenB: leg.tokenB,
          tickLower: leg.tickLower,
          tickUpper: leg.tickUpper,
          retainUsdc: leg.retainUsdc,
          swaps: leg.swaps,
          swapCount: leg.swapCount,
          amountAMin: leg.amountAMin,
          amountBMin: leg.amountBMin,
          slippageBps: leg.slippageBps,
        })) as never,
      ],
    });

    let usedPermit2ExpiryOverride = false;
    let stateOverride:
      | { address: Address; stateDiff: { slot: Hex; value: Hex }[] }[]
      | undefined;
    if (!readiness.ready) {
      // Live wallet still has exact 20 USDC Permit2 amount but short TTL expired.
      // App deposit flow re-approves before write; override only expiry for this gate.
      expect(allowances.permit2AmountToExecutor).toBeGreaterThanOrEqual(GROSS);
      expect(allowances.erc20AllowanceToPermit2).toBeGreaterThanOrEqual(GROSS);
      expect(readiness.needsPermit2Approve).toBe(true);
      const freshExp = blockNow + 3600;
      const slot = permit2AllowanceStorageSlot(WALLET, d.usdc, d.clExecutor);
      stateOverride = [
        {
          address: PERMIT2,
          stateDiff: [
            {
              slot,
              value: packPermit2Allowance(
                allowances.permit2AmountToExecutor,
                freshExp,
                Number(p2[2]),
              ),
            },
          ],
        },
      ];
      usedPermit2ExpiryOverride = true;
    }

    let gas: bigint;
    try {
      gas = await client.estimateGas({
        account: WALLET,
        to: d.clExecutor,
        data,
        ...(stateOverride ? { stateOverride } : {}),
      });
    } catch (err) {
      const decoded = formatStableClubExecutionError(err);
      writeFileSync(
        resolve("tmp/psc-estimate-gas-fail.json"),
        JSON.stringify(
          {
            wallet: WALLET,
            grossUsdc: formatUnits(GROSS, 6),
            decoded,
            message: err instanceof Error ? err.message : String(err),
            permit2Readiness: readiness,
            allowances: {
              erc20: allowances.erc20AllowanceToPermit2.toString(),
              permit2Amount: allowances.permit2AmountToExecutor.toString(),
              permit2Exp: allowances.permit2ExpirationToExecutor,
            },
            usedPermit2ExpiryOverride,
            legs: depositArgs.legs.map((l, i) => ({
              pool: OFFICIAL_STABLE_CLUB_BASE_POOLS[i]!.id,
              amountAMin: l.amountAMin.toString(),
              amountBMin: l.amountBMin.toString(),
              retainUsdc: l.retainUsdc.toString(),
            })),
          },
          null,
          2,
        ),
      );
      throw err;
    }

    writeFileSync(
      resolve("tmp/psc-estimate-gas-ok.json"),
      JSON.stringify(
        {
          wallet: WALLET,
          grossUsdc: formatUnits(GROSS, 6),
          estimateGas: gas.toString(),
          strategyId: STRATEGY_ID,
          usedPermit2ExpiryOverride,
          permit2LiveReady: readiness.ready,
          permit2Exp: allowances.permit2ExpirationToExecutor,
          blockNow,
        },
        null,
        2,
      ),
    );
    expect(gas).toBeGreaterThan(0n);
  }, 180_000);
});
