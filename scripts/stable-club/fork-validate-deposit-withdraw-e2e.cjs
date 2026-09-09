/**
 * FE-equivalent: deposit → withdraw (20% / custom% / 100%) on Base fork.
 * Mirrors product:
 *   - depositIntoFivePoolStrategy via stack matching registered strategy legs
 *   - withdrawPercent → owner NPM batched + residue-only Uni→USDC
 *
 * Counts wallet confirmations (txs). No live broadcast.
 *
 *   FORK_CHAIN_ID=8453 npx hardhat run scripts/stable-club/fork-validate-deposit-withdraw-e2e.cjs --network hardhat
 */
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const WALLET = "0xab4e242C5b489e8301408C93003903364214559F";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const CBBTC = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
const WETH = "0x4200000000000000000000000000000000000006";
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const ORACLE = "0x0cD087927F590B28737dFd9c7AAeB73B8ede70Ba";
const UNI_ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481";
const STRATEGY_REGISTRY = "0xf6696C45A1A186712c530696a5B392Ed9E18ae24";
const MAX_UINT128 = (1n << 128n) - 1n;
const LP_SLIPPAGE_BPS = 500n;
const UNWIND_SLIPPAGE_BPS = 100n;
const USDC_WHALE = "0x3304E22DDaa22bCdC5fCa2269b418046aE7b566A"; // Base Circle-ish USDC holder

const ROUTE_USDC_CBBTC_UNI = ethers.id("ROUTE_USDC_CBBTC_UNI_005");
const ROUTE_USDC_CBBTC_AERO_L = ethers.id("ROUTE_USDC_CBBTC_AERO_LEGACY_100");
const ROUTE_USDC_WETH_UNI = ethers.id("ROUTE_USDC_WETH_UNI_005");

const NPM_UNI = [
  "function positions(uint256) view returns (uint96,address,address,address,uint24,int24,int24,uint128,uint256,uint256,uint128,uint128)",
  "function decreaseLiquidity((uint256 tokenId,uint128 liquidity,uint256 amount0Min,uint256 amount1Min,uint256 deadline)) returns (uint256 amount0,uint256 amount1)",
  "function collect((uint256 tokenId,address recipient,uint128 amount0Max,uint128 amount1Max)) returns (uint256 amount0,uint256 amount1)",
  "function multicall(bytes[]) payable returns (bytes[])",
  "function burn(uint256)",
  "function ownerOf(uint256) view returns (address)",
];
const NPM_AERO = [
  "function positions(uint256) view returns (uint96,address,address,address,int24,int24,int24,uint128,uint256,uint256,uint128,uint128)",
  "function decreaseLiquidity((uint256 tokenId,uint128 liquidity,uint256 amount0Min,uint256 amount1Min,uint256 deadline)) returns (uint256 amount0,uint256 amount1)",
  "function collect((uint256 tokenId,address recipient,uint128 amount0Max,uint128 amount1Max)) returns (uint256 amount0,uint256 amount1)",
  "function multicall(bytes[]) payable returns (bytes[])",
  "function burn(uint256)",
  "function ownerOf(uint256) view returns (address)",
];
const ERC20 = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
];
const ROUTER = [
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)",
];
const ORACLE_ABI = [
  "function expectedAmountOut(address,address,uint256,uint8,uint8) view returns (uint256)",
];
const PERMIT2_ABI = [
  "function approve(address token, address spender, uint160 amount, uint48 expiration)",
  "function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)",
];
const REGISTRY_ABI = [
  "function strategyIdFor(address user, uint256 chainId, address depositToken) view returns (bytes32)",
  "function getStrategy(bytes32) view returns (tuple(address user,uint256 chainId,address depositToken,uint256 allowedActions,uint256 maxTotalPerTx,uint256 maxTotalPerDay,uint256 maxSlippageBps,uint256 minTimeBetweenExecutions,uint256 maxExecutionsPerDay,uint256 expiresAt,bool revoked,bool paused))",
  "function getLeg(bytes32,uint256) view returns (tuple(bytes32 poolId,uint256 allocationBps,address adapter,address tokenA,address tokenB,bytes32 legPermissionId,uint256 maxLegPerTx,uint256 maxLegPerDay))",
  "function strategyDepositNonceUsed(bytes32,uint256) view returns (bool)",
];
const POOL_ABI = ["function tickSpacing() view returns (int24)"];
const ADAPTER_ABI = [
  "function ownerOf(uint256) view returns (address)",
  "function positionTokens(uint256) view returns (address,address)",
  "function positionAmounts(uint256) view returns (uint256,uint256)",
  "function poolId() view returns (bytes32)",
];

function npmAbi(protocol) {
  return protocol === "uni" || protocol === "uniswap-v3" ? NPM_UNI : NPM_AERO;
}

function alignTick(tick, spacing) {
  return Math.trunc(Number(tick) / spacing) * spacing;
}

async function readPoolTick(provider, poolAddress) {
  const slot0Raw = await provider.call({ to: poolAddress, data: "0x3850c7bd" });
  const tickWord = BigInt(`0x${slot0Raw.slice(66, 130)}`);
  return tickWord >= 1n << 255n ? Number(tickWord - (1n << 256n)) : Number(tickWord);
}

async function resetFork() {
  if (!process.env.BASE_RPC_URL) throw new Error("BASE_RPC_URL required");
  await network.provider.request({
    method: "hardhat_reset",
    params: [{ forking: { jsonRpcUrl: process.env.BASE_RPC_URL, chainId: 8453 } }],
  });
  await network.provider.send("evm_mine", []);
  await network.provider.request({ method: "hardhat_impersonateAccount", params: [WALLET] });
  await network.provider.send("hardhat_setBalance", [WALLET, "0x56BC75E2D63100000"]);
}

async function fundUsdc(owner, amount) {
  const usdc = await ethers.getContractAt(ERC20, USDC);
  const bal = await usdc.balanceOf(WALLET);
  if (bal >= amount) return { funded: 0n, had: bal };
  const need = amount - bal;
  await network.provider.request({ method: "hardhat_impersonateAccount", params: [USDC_WHALE] });
  await network.provider.send("hardhat_setBalance", [USDC_WHALE, "0x56BC75E2D63100000"]);
  const whale = await ethers.getSigner(USDC_WHALE);
  const tx = await usdc.connect(whale).transfer(WALLET, need);
  await tx.wait();
  return { funded: need, had: bal };
}

function loadCutoverAdapters() {
  const cutover = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "deployments/base-mainnet/exit-percent-cutover-create.json"),
      "utf8",
    ),
  );
  const legacyCreate = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "deployments/base-mainnet/safe-owned-stack-create.json"),
      "utf8",
    ),
  );
  return {
    primary: {
      clExecutor: cutover.contracts.clExecutor.address,
      adapters: cutover.adapters,
    },
    legacy: {
      clExecutor: legacyCreate.contracts.clExecutor.address,
      adapters: legacyCreate.adapters,
    },
  };
}

function art(rel) {
  return JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "artifacts/contracts/stable-club", rel), "utf8"),
  );
}

async function resolveDepositStack(owner) {
  const stacks = loadCutoverAdapters();
  const registry = await ethers.getContractAt(REGISTRY_ABI, STRATEGY_REGISTRY);
  const sid = await registry.strategyIdFor(WALLET, 8453n, USDC);
  const strategy = await registry.getStrategy(sid);
  const registered =
    strategy.user.toLowerCase() === WALLET.toLowerCase() && !strategy.revoked;
  if (!registered) {
    return {
      kind: "primary",
      clExecutor: stacks.primary.clExecutor,
      adapters: stacks.primary.adapters,
      strategyId: sid,
      registered: false,
    };
  }
  const legs = [];
  for (let i = 0; i < 5; i++) legs.push(await registry.getLeg(sid, i));
  const primarySet = new Set(stacks.primary.adapters.map((a) => a.adapter.toLowerCase()));
  const legacySet = new Set(stacks.legacy.adapters.map((a) => a.adapter.toLowerCase()));
  const allPrimary = legs.every((l) => primarySet.has(l.adapter.toLowerCase()));
  const allLegacy = legs.every((l) => legacySet.has(l.adapter.toLowerCase()));
  if (allLegacy) {
    return {
      kind: "legacy",
      clExecutor: stacks.legacy.clExecutor,
      adapters: stacks.legacy.adapters,
      strategyId: sid,
      registered: true,
      legs,
    };
  }
  if (allPrimary) {
    return {
      kind: "primary",
      clExecutor: stacks.primary.clExecutor,
      adapters: stacks.primary.adapters,
      strategyId: sid,
      registered: true,
      legs,
    };
  }
  throw new Error("mixed/unknown strategy adapters");
}

async function runDeposit(grossUsdc) {
  const owner = await ethers.getSigner(WALLET);
  const prompts = [];
  await fundUsdc(owner, grossUsdc);
  const stack = await resolveDepositStack(owner);
  if (!stack.registered) {
    throw new Error(
      "Wallet has no registered strategy — fork e2e expects legacy-pinned user strategy",
    );
  }

  const cl = new ethers.Contract(
    stack.clExecutor,
    art("StableClubConcentratedLiquidityExecutor.sol/StableClubConcentratedLiquidityExecutor.json").abi,
    owner,
  );
  const oracleGuard = await ethers.getContractAt(ORACLE_ABI, ORACLE);
  const usdc = await ethers.getContractAt(ERC20, USDC);
  const permit2 = await ethers.getContractAt(PERMIT2_ABI, PERMIT2);
  const registry = await ethers.getContractAt(REGISTRY_ABI, STRATEGY_REGISTRY);

  const ercAllow = await usdc.allowance(WALLET, PERMIT2);
  if (ercAllow < grossUsdc) {
    const tx = await usdc.connect(owner).approve(PERMIT2, grossUsdc);
    prompts.push({ phase: "erc20-approve-permit2", hash: tx.hash });
    await tx.wait();
  }
  const p2 = await permit2.allowance(WALLET, USDC, stack.clExecutor);
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (BigInt(p2.amount) < grossUsdc || BigInt(p2.expiration) <= now + 60n) {
    const tx = await permit2
      .connect(owner)
      .approve(USDC, stack.clExecutor, grossUsdc, Number(now + 3600n));
    prompts.push({ phase: "permit2-approve-executor", hash: tx.hash, executor: stack.clExecutor });
    await tx.wait();
  }

  async function oracleQuote(tokenOut, gross) {
    const net = (gross * 9900n) / 10000n;
    const decOut = tokenOut.toLowerCase() === WETH.toLowerCase() ? 18 : 8;
    const expected = await oracleGuard.expectedAmountOut(USDC, tokenOut, net, 6, decOut);
    return { expected, minOut: (expected * 9900n) / 10000n };
  }

  const legBudget = grossUsdc / 5n;
  const half = legBudget / 2n;
  const deadline = now + 3600n;
  const emptySwap = {
    routeId: ethers.ZeroHash,
    grossUsdcIn: 0n,
    minOut: 0n,
    quotedOut: 0n,
    deadline: 0n,
  };
  const depositLegs = [];
  for (let i = 0; i < 5; i++) {
    const a = stack.adapters[i];
    const dualSwap = a.tokenA.toLowerCase() !== USDC.toLowerCase();
    const pool = new ethers.Contract(a.poolAddress, POOL_ABI, ethers.provider);
    const spacing =
      a.protocol === "uniswap-v3" ? Number(await pool.tickSpacing()) : Number(a.tickSpacing);
    const tick = await readPoolTick(ethers.provider, a.poolAddress);
    const tickLower = alignTick(tick - spacing * 10, spacing);
    const tickUpper = alignTick(tick + spacing * 10, spacing);
    if (!dualSwap) {
      const swapRoute =
        a.poolAddress.toLowerCase() === "0x4e962bb3889bf030368f56810a9c96b83cb3e778"
          ? ROUTE_USDC_CBBTC_AERO_L
          : ROUTE_USDC_CBBTC_UNI;
      const q = await oracleQuote(CBBTC, half);
      depositLegs.push({
        legIndex: i,
        adapter: a.adapter,
        tokenA: a.tokenA,
        tokenB: a.tokenB,
        tickLower,
        tickUpper,
        retainUsdc: half,
        swaps: [
          {
            routeId: swapRoute,
            grossUsdcIn: half,
            minOut: q.minOut,
            quotedOut: q.expected,
            deadline,
          },
          emptySwap,
        ],
        swapCount: 1,
        amountAMin: 1n,
        amountBMin: 1n,
        slippageBps: 500n,
      });
    } else {
      const qCb = await oracleQuote(CBBTC, half);
      const qWe = await oracleQuote(WETH, half);
      depositLegs.push({
        legIndex: i,
        adapter: a.adapter,
        tokenA: a.tokenA,
        tokenB: a.tokenB,
        tickLower,
        tickUpper,
        retainUsdc: 0n,
        swaps: [
          {
            routeId: ROUTE_USDC_CBBTC_UNI,
            grossUsdcIn: half,
            minOut: qCb.minOut,
            quotedOut: qCb.expected,
            deadline,
          },
          {
            routeId: ROUTE_USDC_WETH_UNI,
            grossUsdcIn: half,
            minOut: qWe.minOut,
            quotedOut: qWe.expected,
            deadline,
          },
        ],
        swapCount: 2,
        amountAMin: 1n,
        amountBMin: 1n,
        slippageBps: 500n,
      });
    }
  }

  let depositNonce = 1n;
  for (let n = 1n; n <= 50n; n++) {
    if (!(await registry.strategyDepositNonceUsed(stack.strategyId, n))) {
      depositNonce = n;
      break;
    }
    if (n === 50n) throw new Error("no free deposit nonce");
  }

  const poolIds = stack.adapters.map((a) => a.poolId);
  const usdcBefore = await usdc.balanceOf(WALLET);
  const tx = await cl.depositFivePoolStrategy(
    stack.strategyId,
    depositNonce,
    grossUsdc,
    poolIds,
    deadline,
    depositLegs,
    { gasLimit: 15_000_000n },
  );
  prompts.push({
    phase: "depositFivePoolStrategy",
    hash: tx.hash,
    executor: stack.clExecutor,
    stack: stack.kind,
  });
  const rec = await tx.wait();
  if (rec.status !== 1) throw new Error("deposit reverted");

  const transferIface = new ethers.Interface([
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  ]);
  const mintCandidates = [];
  for (const log of rec.logs) {
    try {
      const parsed = transferIface.parseLog(log);
      if (
        parsed &&
        parsed.args.from === ethers.ZeroAddress &&
        parsed.args.to.toLowerCase() === WALLET.toLowerCase()
      ) {
        mintCandidates.push({ npm: log.address, tokenId: parsed.args.tokenId });
      }
    } catch {
      /* ignore */
    }
  }

  const positions = [];
  const used = new Set();
  for (let i = 0; i < 5; i++) {
    const a = stack.adapters[i];
    const adapter = new ethers.Contract(a.adapter, ADAPTER_ABI, ethers.provider);
    let tokenId;
    for (let j = mintCandidates.length - 1; j >= 0; j--) {
      const c = mintCandidates[j];
      if (c.npm.toLowerCase() !== a.npm.toLowerCase()) continue;
      const key = `${c.npm}:${c.tokenId}`;
      if (used.has(key)) continue;
      try {
        if ((await adapter.ownerOf(c.tokenId)).toLowerCase() !== WALLET.toLowerCase()) continue;
        const [t0, t1] = await adapter.positionTokens(c.tokenId);
        const [e0, e1] =
          a.tokenA.toLowerCase() < a.tokenB.toLowerCase()
            ? [a.tokenA, a.tokenB]
            : [a.tokenB, a.tokenA];
        if (t0.toLowerCase() !== e0.toLowerCase() || t1.toLowerCase() !== e1.toLowerCase()) {
          continue;
        }
        const amounts = await adapter.positionAmounts(c.tokenId);
        if (amounts[0] + amounts[1] === 0n) continue;
        tokenId = c.tokenId;
        used.add(key);
        break;
      } catch {
        /* continue */
      }
    }
    if (tokenId === undefined) throw new Error(`NFT not found for leg ${i}`);
    positions.push({
      leg: i,
      protocol: a.protocol,
      npm: a.npm,
      adapter: a.adapter,
      tokenId,
    });
  }

  const usdcAfter = await usdc.balanceOf(WALLET);
  return {
    ok: true,
    stack: stack.kind,
    clExecutor: stack.clExecutor,
    grossUsdc: grossUsdc.toString(),
    usdcSpent: (usdcBefore - usdcAfter).toString(),
    walletConfirmationCount: prompts.length,
    maxTwoMet: prompts.length <= 2,
    prompts,
    positions,
  };
}

async function runOwnerWithdraw(positions, percent) {
  const owner = await ethers.getSigner(WALLET);
  const deadline = BigInt((await time.latest()) + 1200);
  const usdc = await ethers.getContractAt(ERC20, USDC);
  const oracle = await ethers.getContractAt(ORACLE_ABI, ORACLE);
  const router = await ethers.getContractAt(ROUTER, UNI_ROUTER);
  const percentBps = BigInt(Math.round(percent) * 100);
  const fullExit = Math.round(percent) === 100;
  const usdcBefore = await usdc.balanceOf(WALLET);
  const baseline = {
    cbBTC: await (await ethers.getContractAt(ERC20, CBBTC)).balanceOf(WALLET),
    WETH: await (await ethers.getContractAt(ERC20, WETH)).balanceOf(WALLET),
  };
  const liqBefore = [];
  for (const p of positions) {
    const npm = await ethers.getContractAt(npmAbi(p.protocol), p.npm);
    const pos = await npm.positions(p.tokenId);
    liqBefore.push(pos[7]);
  }
  const prompts = [];

  const byNpm = new Map();
  for (const p of positions) {
    const key = p.npm.toLowerCase();
    if (!byNpm.has(key)) byNpm.set(key, []);
    byNpm.get(key).push(p);
  }

  for (const [, group] of byNpm) {
    const npm = await ethers.getContractAt(npmAbi(group[0].protocol), group[0].npm);
    const inner = [];
    for (const p of group) {
      const pos = await npm.positions(p.tokenId);
      const liqOut = fullExit ? pos[7] : (pos[7] * percentBps) / 10000n;
      if (liqOut <= 0n) throw new Error(`leg ${p.leg} liqOut 0`);
      const simDec = npm.interface.encodeFunctionData("decreaseLiquidity", [
        { tokenId: p.tokenId, liquidity: liqOut, amount0Min: 0n, amount1Min: 0n, deadline },
      ]);
      const simCol = npm.interface.encodeFunctionData("collect", [
        { tokenId: p.tokenId, recipient: WALLET, amount0Max: MAX_UINT128, amount1Max: MAX_UINT128 },
      ]);
      const sim = await npm.connect(owner).multicall.staticCall([simDec, simCol]);
      const dec = npm.interface.decodeFunctionResult("decreaseLiquidity", sim[0]);
      const min0 = (dec[0] * (10000n - LP_SLIPPAGE_BPS)) / 10000n;
      const min1 = (dec[1] * (10000n - LP_SLIPPAGE_BPS)) / 10000n;
      inner.push(
        npm.interface.encodeFunctionData("decreaseLiquidity", [
          { tokenId: p.tokenId, liquidity: liqOut, amount0Min: min0, amount1Min: min1, deadline },
        ]),
      );
      inner.push(
        npm.interface.encodeFunctionData("collect", [
          { tokenId: p.tokenId, recipient: WALLET, amount0Max: MAX_UINT128, amount1Max: MAX_UINT128 },
        ]),
      );
      if (fullExit || liqOut >= pos[7]) {
        inner.push(npm.interface.encodeFunctionData("burn", [p.tokenId]));
      }
    }
    const tx = await npm.connect(owner).multicall(inner);
    prompts.push({
      phase: "npm-owner-multicall-batched",
      legs: group.map((g) => g.leg),
      to: group[0].npm,
    });
    await tx.wait();
  }

  // Residue-only recover (Δ over baseline) — mirrors FE checkpoint
  for (const [token, symbol, dec] of [
    [CBBTC, "cbBTC", 8],
    [WETH, "WETH", 18],
  ]) {
    const erc = await ethers.getContractAt(ERC20, token);
    const bal = await erc.balanceOf(WALLET);
    const base = baseline[symbol];
    const residue = bal > base ? bal - base : 0n;
    if (residue <= 0n) continue;
    const quoted = await oracle.expectedAmountOut(token, USDC, residue, dec, 6);
    const minOut = (quoted * (10000n - UNWIND_SLIPPAGE_BPS)) / 10000n;
    const allowance = await erc.allowance(WALLET, UNI_ROUTER);
    if (allowance < residue) {
      const a = await erc.connect(owner).approve(UNI_ROUTER, residue);
      prompts.push({ phase: "uni-router-erc20-approve", symbol });
      await a.wait();
    }
    const swap = await router.connect(owner).exactInputSingle({
      tokenIn: token,
      tokenOut: USDC,
      fee: 500,
      recipient: WALLET,
      amountIn: residue,
      amountOutMinimum: minOut,
      sqrtPriceLimitX96: 0n,
    });
    prompts.push({ phase: "uni-exactInputSingle", symbol });
    await swap.wait();
  }

  const leftoverCb =
    (await (await ethers.getContractAt(ERC20, CBBTC)).balanceOf(WALLET)) - baseline.cbBTC;
  const leftoverWeth =
    (await (await ethers.getContractAt(ERC20, WETH)).balanceOf(WALLET)) - baseline.WETH;
  if (leftoverCb > 0n || leftoverWeth > 0n) {
    throw new Error(`stranded residue cb=${leftoverCb} weth=${leftoverWeth}`);
  }

  const liqAfter = [];
  for (const p of positions) {
    const npm = await ethers.getContractAt(npmAbi(p.protocol), p.npm);
    if (fullExit) {
      try {
        await npm.ownerOf(p.tokenId);
        throw new Error(`NFT ${p.tokenId} still owned after 100%`);
      } catch (e) {
        if (String(e.message).includes("still owned")) throw e;
        liqAfter.push(0n);
      }
    } else {
      const pos = await npm.positions(p.tokenId);
      liqAfter.push(pos[7]);
    }
  }

  const proportional = liqBefore.map((before, i) => {
    if (fullExit) return { before: before.toString(), after: "0", removedBps: 10000 };
    const after = liqAfter[i];
    const removed = before - after;
    const bps = before === 0n ? 0 : Number((removed * 10000n) / before);
    return { before: before.toString(), after: after.toString(), removedBps: bps };
  });

  const usdcAfter = await usdc.balanceOf(WALLET);
  const usdcReceived = usdcAfter - usdcBefore;
  if (usdcReceived <= 0n) throw new Error("USDC did not increase");

  return {
    ok: true,
    feRoute: "withdrawPercent → withdrawLegacyPercentViaOwnerNpm",
    percent: Math.round(percent),
    npmBatches: byNpm.size,
    usdcReceived: usdcReceived.toString(),
    usdcReceivedFormatted: (Number(usdcReceived) / 1e6).toFixed(6),
    proportional,
    walletConfirmationCount: prompts.length,
    maxTwoMet: prompts.length <= 2,
    prompts,
  };
}

async function main() {
  const report = {
    liveFundsMoved: false,
    liveSigningRequested: false,
    wallet: WALLET,
    targetMaxWalletConfirms: 2,
    results: {},
    blockers: {
      depositCold:
        "Up to 4 confirms (register + ERC20→Permit2 + Permit2→executor + depositFivePoolStrategy). Warm with allowances: 1.",
      withdrawAnyPercent:
        "Owner must send 1 tx per NPM (3 distinct NPMs) plus Uni approve/swap for cbBTC/WETH residue (typically 5–7 cold). Multicall only batches within one NPM. No deployed IndexLa entrypoint closes all five legs + Uni unwind in ≤2 user txs.",
      requiredChangeForMaxTwo:
        "New batch/executor (or Safe module / EIP-5792-reliable multicaller) that can operate all NPMs + residue→USDC in one or two user transactions; and/or sticky setApprovalForAll design on verified adapters for atomic exitAllToUsdc warm path.",
    },
  };

  const gross = ethers.parseUnits("10", 6);

  for (const [key, pct] of [
    ["pct20", 20],
    ["custom37", 37],
    ["pct100", 100],
  ]) {
    console.log(`=== deposit + withdraw ${pct}% ===`);
    await resetFork();
    const deposit = await runDeposit(gross);
    console.log(JSON.stringify({ deposit: { ...deposit, positions: deposit.positions.map((p) => ({ ...p, tokenId: p.tokenId.toString() })) } }, null, 2));
    const withdraw = await runOwnerWithdraw(deposit.positions, pct);
    console.log(JSON.stringify({ withdraw }, null, 2));
    report.results[key] = {
      deposit: {
        ok: deposit.ok,
        stack: deposit.stack,
        walletConfirmationCount: deposit.walletConfirmationCount,
        maxTwoMet: deposit.maxTwoMet,
        prompts: deposit.prompts,
      },
      withdraw,
    };
  }

  report.allPassed = ["pct20", "custom37", "pct100"].every((k) => {
    const r = report.results[k];
    return r.deposit.ok && r.withdraw.ok && r.withdraw.usdcReceived !== "0";
  });
  report.maxTwoAchieved = {
    deposit: Object.values(report.results).every((r) => r.deposit.maxTwoMet),
    withdraw: Object.values(report.results).every((r) => r.withdraw.maxTwoMet),
  };

  const outPath = path.join(
    process.cwd(),
    "scripts/stable-club/_fork-deposit-withdraw-e2e-report.json",
  );
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`wrote ${outPath}`);
  if (!report.allPassed) process.exitCode = 1;
  else console.log("SUCCESS deposit-withdraw-e2e-fork");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
