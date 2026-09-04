/**
 * Read-only Base mainnet deposit simulation.
 * No broadcasts. No state writes. Skipped unless BASE_RPC_URL is set.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createPublicClient,
  http,
  parseUnits,
  formatUnits,
  formatEther,
  encodeFunctionData,
  type Address,
  type Hex,
} from "viem";
import { base } from "viem/chains";
import { keccak256, stringToHex } from "viem";
import {
  parseUsdcDepositInput,
  FIVE_POOL_MIN_USDC_HUMAN,
  FIVE_POOL_DEFAULT_SWAP_SLIPPAGE_BPS,
  FIVE_POOL_DEFAULT_LP_SLIPPAGE_BPS,
  FIVE_POOL_DEFAULT_QUOTE_MAX_AGE_SEC,
  FIVE_POOL_DEFAULT_DEADLINE_SEC,
  buildDepositPreview,
} from "@/lib/stable-club/five-pool-deposit";
import { createOracleGuardQuoteAdapter } from "@/lib/stable-club/five-pool-quotes";
import {
  allocateFivePoolBudgets,
  buildFivePoolQuotePlan,
  buildFivePoolSwapQuoteRequests,
} from "@/lib/stable-club/quote-plan";
import { OFFICIAL_STABLE_CLUB_BASE_POOLS } from "@/lib/stable-club/official-pools";
import { STAGE1_FIVE_POOL_BETA_POOL_IDS } from "@/lib/stable-club/stage1-launch";
import {
  evaluateStableClubBetaReadiness,
  readRegisteredCataloguePoolIds,
} from "@/lib/stable-club/stable-club-beta-readiness";
import {
  TRUSTED_PHASE2A_BASE_DEPLOYMENTS,
  TRUSTED_PHASE2A_BASE_MANIFEST,
} from "@/lib/stable-club/trusted-phase2a-base-manifest";
import {
  attestPhase2aDeployments,
  toPublicPhase2aDeploymentsPayload,
} from "@/lib/stable-club/phase2a-deployments";
import { STABLE_CLUB_SWAP_ROUTE_IDS } from "@/lib/stable-club/swap-routes";
import { APPROVED_GAS_CEILING_WEI } from "@/lib/stable-club/gas-ceiling-recommendation";
import { PRIVATE_BETA_LAUNCH_PARAMS } from "@/lib/stable-club/launch-params";

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvLocal();

const RPC = process.env.BASE_RPC_URL?.trim() || "";
const ZERO = "0x0000000000000000000000000000000000000000" as Address;

const poolAdaptersAbi = [
  {
    type: "function",
    name: "poolAdapters",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "approvedAdapters",
    stateMutability: "view",
    inputs: [{ name: "adapter", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "approvedTokens",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const routeAbi = [
  {
    type: "function",
    name: "getRoute",
    stateMutability: "view",
    inputs: [{ name: "routeId", type: "bytes32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "kind", type: "uint8" },
          { name: "router", type: "address" },
          { name: "factory", type: "address" },
          { name: "pool", type: "address" },
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "feeOrTickSpacing", type: "uint24" },
          { name: "enabled", type: "bool" },
        ],
      },
    ],
  },
] as const;

const oracleAbi = [
  {
    type: "function",
    name: "feeds",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "aggregator", type: "address" },
          { name: "maxStalenessSec", type: "uint32" },
          { name: "decimals", type: "uint8" },
          { name: "enabled", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "pegMonitors",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "referenceAggregator", type: "address" },
          { name: "maxDeviationBps", type: "uint16" },
          { name: "decimals", type: "uint8" },
          { name: "enabled", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "expectedAmountOut",
    stateMutability: "view",
    inputs: [
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "decimalsIn", type: "uint8" },
      { name: "decimalsOut", type: "uint8" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const safetyAbi = [
  {
    type: "function",
    name: "maxGasPriceWei",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "guardian",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const feedAbi = [
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
] as const;

const ownableAbi = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

describe("Base mainnet read-only deposit simulation", () => {
  it.skipIf(!RPC)(
    "simulates smallest supported USDC deposit against live contracts",
    async () => {
      const report: Record<string, unknown> = {
        mode: "read-only",
        chainId: 8453,
        broadcast: false,
        modified: false,
      };
      const blockers: string[] = [];
      const warnings: string[] = [];

      const client = createPublicClient({
        chain: base,
        transport: http(RPC, { retryCount: 3, timeout: 30_000 }),
      });
      const chainId = await client.getChainId();
      expect(chainId).toBe(8453);

      // --- poolsActivated artifact flag vs on-chain registration ---
      const artifactPath = resolve(
        process.cwd(),
        "deployments/base-mainnet/stable-club-phase2a.deploy-artifact.json",
      );
      let artifactPoolsActivated: boolean | null = null;
      if (existsSync(artifactPath)) {
        const art = JSON.parse(readFileSync(artifactPath, "utf8")) as {
          poolsActivated?: boolean;
        };
        artifactPoolsActivated = art.poolsActivated === true;
      }
      report.poolsActivatedArtifactFlag = artifactPoolsActivated;
      report.poolsActivatedBlocksOnChainDeposit = false;
      report.poolsActivatedNote =
        "Deploy artifact poolsActivated=false is a ceremony/flag for the deploy script only. " +
        "depositFivePoolStrategy gates on poolAdapters[poolId]==adapter (registration), " +
        "not on an on-chain poolsActivated boolean. UI depositsEnabled uses the same registration check.";

      const d = TRUSTED_PHASE2A_BASE_DEPLOYMENTS;
      const clExecutor = d.clExecutor as Address;
      const swapRouter = d.swapRouter as Address;
      const oracleGuard = d.oracleGuard as Address;
      const safety = d.safetyController as Address;

      // Rate-limit friendly pacing
      const pace = async () => sleep(200);

      // --- Five pool registrations (20% legs) ---
      const registered: { id: string; poolIdHash: Hex; adapter: Address; approved: boolean }[] =
        [];
      for (const pool of OFFICIAL_STABLE_CLUB_BASE_POOLS) {
        await pace();
        const adapter = (await client.readContract({
          address: clExecutor,
          abi: poolAdaptersAbi,
          functionName: "poolAdapters",
          args: [pool.poolIdHash],
        })) as Address;
        await pace();
        const approved =
          adapter.toLowerCase() !== ZERO.toLowerCase()
            ? await client.readContract({
                address: clExecutor,
                abi: poolAdaptersAbi,
                functionName: "approvedAdapters",
                args: [adapter],
              })
            : false;
        registered.push({
          id: pool.id,
          poolIdHash: pool.poolIdHash,
          adapter,
          approved: Boolean(approved),
        });
        if (adapter.toLowerCase() === ZERO.toLowerCase()) {
          blockers.push(`Pool not registered on clExecutor: ${pool.id}`);
        } else if (!approved) {
          blockers.push(`Adapter not approved for ${pool.id}: ${adapter}`);
        }
      }
      // Confirm pinned adapters match live registration order
      for (let i = 0; i < 5; i++) {
        const pinned = TRUSTED_PHASE2A_BASE_MANIFEST.contracts.adapters[i]!;
        const live = registered[i]!.adapter;
        if (live.toLowerCase() !== pinned.toLowerCase()) {
          blockers.push(
            `Adapter mismatch leg ${i}: live=${live} pinned=${pinned}`,
          );
        }
      }
      report.legs = registered.map((r, i) => ({
        legIndex: i,
        poolId: r.id,
        allocationBps: 2000,
        adapter: r.adapter,
        approved: r.approved,
        registered: r.adapter.toLowerCase() !== ZERO.toLowerCase(),
      }));

      // --- Tokens approved ---
      for (const token of [d.usdc, d.cbbtc, d.weth] as Address[]) {
        await pace();
        const ok = await client.readContract({
          address: clExecutor,
          abi: poolAdaptersAbi,
          functionName: "approvedTokens",
          args: [token],
        });
        if (!ok) blockers.push(`Token not approved on clExecutor: ${token}`);
      }

      // --- Routes ---
      const routeChecks: Record<string, unknown> = {};
      for (const [key, routeId] of Object.entries(STABLE_CLUB_SWAP_ROUTE_IDS)) {
        await pace();
        const route = await client.readContract({
          address: swapRouter,
          abi: routeAbi,
          functionName: "getRoute",
          args: [routeId as Hex],
        });
        const enabled = Boolean(route.enabled);
        routeChecks[key] = {
          routeId,
          enabled,
          pool: route.pool,
          tokenIn: route.tokenIn,
          tokenOut: route.tokenOut,
        };
        if (!enabled) blockers.push(`Route disabled: ${key}`);
        if (route.tokenIn.toLowerCase() !== d.usdc.toLowerCase()) {
          blockers.push(`Route ${key} tokenIn is not USDC`);
        }
      }
      report.routes = routeChecks;

      // --- Oracles ---
      const nowSec = Math.floor(Date.now() / 1000);
      const oracleChecks: Record<string, unknown> = {};
      for (const [label, token] of [
        ["USDC", d.usdc],
        ["cbBTC", d.cbbtc],
        ["WETH", d.weth],
      ] as const) {
        await pace();
        const feed = await client.readContract({
          address: oracleGuard,
          abi: oracleAbi,
          functionName: "feeds",
          args: [token as Address],
        });
        let answer: bigint | null = null;
        let updatedAt = 0;
        let stale = true;
        if (feed.enabled && feed.aggregator !== ZERO) {
          await pace();
          const round = await client.readContract({
            address: feed.aggregator as Address,
            abi: feedAbi,
            functionName: "latestRoundData",
          });
          answer = round[1];
          updatedAt = Number(round[3]);
          stale = nowSec - updatedAt > Number(feed.maxStalenessSec);
        }
        oracleChecks[label] = {
          enabled: feed.enabled,
          aggregator: feed.aggregator,
          maxStalenessSec: Number(feed.maxStalenessSec),
          answer: answer?.toString() ?? null,
          updatedAt,
          stale,
        };
        if (!feed.enabled) blockers.push(`Oracle feed disabled: ${label}`);
        if (stale) blockers.push(`Oracle feed stale: ${label}`);
      }
      await pace();
      const peg = await client.readContract({
        address: oracleGuard,
        abi: oracleAbi,
        functionName: "pegMonitors",
        args: [d.cbbtc as Address],
      });
      oracleChecks.cbBtcPeg = {
        enabled: peg.enabled,
        referenceAggregator: peg.referenceAggregator,
        maxDeviationBps: Number(peg.maxDeviationBps),
      };
      if (!peg.enabled) blockers.push("cbBTC peg monitor disabled");
      report.oracles = oracleChecks;

      // --- Ownership / guardian / gas ceiling ---
      await pace();
      const maxGas = await client.readContract({
        address: safety,
        abi: safetyAbi,
        functionName: "maxGasPriceWei",
      });
      await pace();
      const guardian = await client.readContract({
        address: safety,
        abi: safetyAbi,
        functionName: "guardian",
      });
      await pace();
      const clOwner = await client.readContract({
        address: clExecutor,
        abi: ownableAbi,
        functionName: "owner",
      });
      const feeData = await client.getGasPrice();
      const gasCeilingOk = maxGas.toString() === APPROVED_GAS_CEILING_WEI;
      const underCeiling = feeData <= maxGas;
      if (!gasCeilingOk) {
        blockers.push(
          `SafetyController.maxGasPriceWei ${maxGas} != approved ${APPROVED_GAS_CEILING_WEI}`,
        );
      }
      if (!underCeiling) {
        blockers.push(
          `Live gasPrice ${feeData} exceeds SafetyController ceiling ${maxGas}`,
        );
      }
      report.gas = {
        liveGasPriceWei: feeData.toString(),
        liveGasPriceGwei: Number(formatUnits(feeData, 9)),
        maxGasPriceWei: maxGas.toString(),
        underCeiling,
        ceilingMatchesApproval: gasCeilingOk,
        forkRehearsalDepositGas:
          "250000-550000 L2 (from GAS_CEILING_RECOMMENDATION)",
        note: "Full deposit estimateGas requires a registered strategy + Permit2 allowances; not simulated as a broadcast. Component eth_calls + published fork gas band used.",
      };
      report.guardian = guardian;
      report.clExecutorOwner = clOwner;
      report.timelock = "0x6A83733C829B6F8a9C0E0D4d5713D64eE959167a";

      // --- Minimum amount + 5×20% allocation ---
      const minHuman = String(FIVE_POOL_MIN_USDC_HUMAN);
      const parsed = parseUsdcDepositInput(minHuman);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) {
        blockers.push(parsed.message);
        throw new Error(parsed.message);
      }
      const below = parseUsdcDepositInput("19.999999");
      expect(below.ok).toBe(false);
      const { legBudgets } = allocateFivePoolBudgets(parsed.grossUsdc);
      expect(legBudgets).toHaveLength(5);
      expect(legBudgets.every((b) => b === parsed.grossUsdc / 5n)).toBe(true);
      // 20 USDC × 20% = 4 USDC per leg (exactly five-way allocatable)
      expect(formatUnits(legBudgets[0]!, 6)).toBe("4");
      report.minimumTestAmount = {
        humanUsdc: minHuman,
        units: parsed.grossUsdc.toString(),
        perLegUsdc: formatUnits(legBudgets[0]!, 6),
        allocationBpsPerLeg: 2000,
        source: "PRIVATE_BETA_LAUNCH_PARAMS.capsUsd.minimumPosition",
      };

      // --- Live OracleGuard quotes + quote plan + slippage ---
      const quoteAdapter = createOracleGuardQuoteAdapter({
        publicClient: client as never,
        oracleGuard,
        tokens: {
          usdc: d.usdc as Address,
          cbbtc: d.cbbtc as Address,
          weth: d.weth as Address,
        },
      });
      await pace();
      const bundle = await quoteAdapter.fetchQuotes({
        grossUsdc: parsed.grossUsdc,
        nowSec,
      });
      expect(bundle.source).toBe("oracle-guard");
      expect(Object.keys(bundle.quotes)).toHaveLength(8);

      // Read live ticks for each pool
      const currentTicks: number[] = [];
      for (const pool of OFFICIAL_STABLE_CLUB_BASE_POOLS) {
        await pace();
        const slot0 = await client.call({
          to: pool.poolAddress as Address,
          data: "0x3850c7bd",
        });
        const hex = slot0.data ?? "0x";
        const tickWord = BigInt(`0x${hex.slice(66, 130)}`);
        const tick =
          tickWord >= 1n << 255n ? Number(tickWord - (1n << 256n)) : Number(tickWord);
        currentTicks.push(tick);
      }

      const adapters = TRUSTED_PHASE2A_BASE_MANIFEST.contracts.adapters.map(
        (a) => a as Address,
      ) as [Address, Address, Address, Address, Address];
      const deadline = BigInt(nowSec + FIVE_POOL_DEFAULT_DEADLINE_SEC);
      const plan = buildFivePoolQuotePlan({
        grossUsdc: parsed.grossUsdc,
        adapters,
        currentTicks,
        quotes: bundle.quotes,
        slippageBps: FIVE_POOL_DEFAULT_SWAP_SLIPPAGE_BPS,
        lpSlippageBps: FIVE_POOL_DEFAULT_LP_SLIPPAGE_BPS,
        deadline,
        nowSec,
        maxQuoteAgeSec: FIVE_POOL_DEFAULT_QUOTE_MAX_AGE_SEC,
      });
      expect(plan.legs).toHaveLength(5);
      expect(plan.swaps).toHaveLength(8);
      for (const leg of plan.legs) {
        if (leg.amountAMin === 0n && leg.amountBMin === 0n) {
          blockers.push(`Leg ${leg.legIndex} has zero LP minimums`);
        }
        for (let s = 0; s < leg.swapCount; s++) {
          const swap = leg.swaps[s]!;
          if (swap.minOut === 0n || swap.quotedOut === 0n) {
            blockers.push(`Leg ${leg.legIndex} swap ${s} has zero min/quoted out`);
          }
        }
      }
      const preview = buildDepositPreview({
        plan,
        quotedAtSec: bundle.quotedAtSec,
        maxQuoteAgeSec: FIVE_POOL_DEFAULT_QUOTE_MAX_AGE_SEC,
        quoteSource: bundle.source,
      });
      report.quotePlan = {
        swapCount: plan.swaps.length,
        swapSlippageBps: Number(plan.slippageBps),
        lpSlippageBps: Number(plan.lpSlippageBps),
        deadline: deadline.toString(),
        legs: preview.pools.map((p) => ({
          poolId: p.poolId,
          allocationUsdc: formatUnits(p.allocationUsdc, 6),
          desiredA: p.desiredA.toString(),
          desiredB: p.desiredB.toString(),
          amountAMin: p.amountAMin.toString(),
          amountBMin: p.amountBMin.toString(),
        })),
        swaps: preview.swaps.map((s) => ({
          slotId: s.slotId,
          routeKey: s.routeKey,
          grossUsdcIn: formatUnits(s.grossUsdcIn, 6),
          netUsdcIn: formatUnits(s.netUsdcIn, 6),
          quotedOut: s.quotedOut.toString(),
          minOut: s.minOut.toString(),
        })),
      };
      report.quoteRequests = buildFivePoolSwapQuoteRequests(parsed.grossUsdc).map((r) => ({
        slotId: r.slotId,
        netUsdcIn: formatUnits(r.netUsdcIn, 6),
        decimalsOut: r.decimalsOut,
      }));

      // Sample eth_call: oracle expectedAmountOut (already used) — also encode deposit calldata size only
      const sampleOracleCalldata = encodeFunctionData({
        abi: oracleAbi,
        functionName: "expectedAmountOut",
        args: [d.usdc as Address, d.cbbtc as Address, 25_000_000n, 6, 8],
      });
      report.sampleEthCall = {
        oracleExpectedAmountOutBytes: (sampleOracleCalldata.length - 2) / 2,
        note: "No depositFivePoolStrategy eth_estimateGas without strategy registration + allowances (would revert; not a production write).",
      };

      // --- Attestation + readiness + live API button gate ---
      const publicDeployments = toPublicPhase2aDeploymentsPayload(d);
      await attestPhase2aDeployments({
        client: {
          getChainId: () => client.getChainId(),
          getBytecode: (args) => client.getBytecode(args),
        },
        deployments: publicDeployments,
      });
      report.attestationPassed = true;

      const activatedOnChainIds = await readRegisteredCataloguePoolIds(
        client as never,
        clExecutor,
      );
      const readiness = evaluateStableClubBetaReadiness({
        attestationPassed: true,
        isBaseProduction: true,
        activatedOnChainIds,
      });
      report.readiness = readiness;
      if (!readiness.depositsEnabled) {
        for (const b of readiness.depositBlockers) blockers.push(b);
      }

      // Live production API (button depends on this + readiness)
      let liveApi: { configured?: boolean; clExecutor?: string; message?: string } = {};
      try {
        const res = await fetch(
          "https://app.indexla.tech/api/stable-club/phase2a-deployments",
        );
        const json = (await res.json()) as {
          configured: boolean;
          message?: string;
          deployments?: { clExecutor?: string };
        };
        liveApi = {
          configured: json.configured,
          clExecutor: json.deployments?.clExecutor,
          message: json.message,
        };
        if (!json.configured) {
          blockers.push(`Live API not configured: ${json.message ?? "unknown"}`);
        } else if (
          json.deployments?.clExecutor?.toLowerCase() !== clExecutor.toLowerCase()
        ) {
          blockers.push("Live API clExecutor mismatch vs trusted pin");
        }
      } catch (e) {
        blockers.push(`Live API fetch failed: ${String(e)}`);
      }
      report.liveApi = liveApi;
      report.liveDepositButton = {
        enabledWhen:
          "depositsEnabled === true (trusted manifest + attestation + all five poolAdapters registered)",
        depositsEnabled: readiness.depositsEnabled,
        poolsActivatedArtifactFalseBlocksButton: false,
        expectedUiState: readiness.depositsEnabled
          ? "Deposit Into 5-Pool Strategy enabled (wallet still required to click)"
          : "Deposit button disabled",
      };

      report.automation = PRIVATE_BETA_LAUNCH_PARAMS.automation;
      report.blockers = blockers;
      report.warnings = warnings;

      const verdict =
        blockers.length === 0 && readiness.depositsEnabled ? "GO" : "NO-GO";
      report.verdict = verdict;

      // eslint-disable-next-line no-console
      console.log("\n=== BASE DEPOSIT READ-ONLY SIM ===\n");
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(report, null, 2));

      expect(verdict).toBe("GO");
      expect(FIVE_POOL_MIN_USDC_HUMAN).toBe(20);
      expect(STAGE1_FIVE_POOL_BETA_POOL_IDS).toHaveLength(5);
      // Prove artifact flag alone is not a blocker when registrations exist
      expect(artifactPoolsActivated).toBe(false);
      expect(readiness.depositsEnabled).toBe(true);
    },
    180_000,
  );
});
