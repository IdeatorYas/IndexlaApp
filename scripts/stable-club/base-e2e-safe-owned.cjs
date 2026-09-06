#!/usr/bin/env node
/**
 * Tiny live Base E2E against Safe-owned stack:
 * deposit → 5 LPs → harvestAll → compoundAll → exitAllToUsdc (USDC-only).
 *
 * Uses DEPLOYER_PRIVATE_KEY as the test user. No Safe broadcast.
 */
require("dotenv").config({ path: ".env.local" });
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const CBBTC = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
const WETH = "0x4200000000000000000000000000000000000006";
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

const ROUTE_USDC_CBBTC_UNI = ethers.id("ROUTE_USDC_CBBTC_UNI_005");
const ROUTE_USDC_CBBTC_AERO_L = ethers.id("ROUTE_USDC_CBBTC_AERO_LEGACY_100");
const ROUTE_USDC_WETH_UNI = ethers.id("ROUTE_USDC_WETH_UNI_005");
const ROUTE_CBBTC_USDC_UNI = ethers.id("ROUTE_CBBTC_USDC_UNI_005");
const ROUTE_WETH_USDC_UNI = ethers.id("ROUTE_WETH_USDC_UNI_005");

const ALL_ACTIONS =
  (1n << 0n) |
  (1n << 1n) |
  (1n << 2n) |
  (1n << 3n) |
  (1n << 4n) |
  (1n << 6n) |
  (1n << 7n) |
  (1n << 8n) |
  (1n << 9n);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
];
const PERMIT2_ABI = [
  "function approve(address token, address spender, uint160 amount, uint48 expiration)",
];
const POOL_ABI = ["function tickSpacing() view returns (int24)"];

async function readPoolTick(provider, poolAddress) {
  const slot0Raw = await provider.call({ to: poolAddress, data: "0x3850c7bd" });
  const tickWord = BigInt(`0x${slot0Raw.slice(66, 130)}`);
  return tickWord >= 1n << 255n ? Number(tickWord - (1n << 256n)) : Number(tickWord);
}

function alignTick(tick, spacing) {
  return Math.trunc(Number(tick) / spacing) * spacing;
}

async function main() {
  const create = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "deployments/base-mainnet/safe-owned-stack-create.json"),
      "utf8",
    ),
  );
  const rpc = process.env.BASE_RPC_URL?.trim();
  const pk = process.env.DEPLOYER_PRIVATE_KEY?.trim();
  if (!rpc || !pk) throw new Error("BASE_RPC_URL + DEPLOYER_PRIVATE_KEY required");

  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(pk.startsWith("0x") ? pk : `0x${pk}`, provider);
  const net = await provider.getNetwork();
  if (Number(net.chainId) !== 8453) throw new Error(`Refuse chainId=${net.chainId}`);

  const clAddr = create.contracts.clExecutor.address;
  const adaptersMeta = create.adapters;

  const art = (rel) =>
    JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "artifacts/contracts/stable-club", rel),
        "utf8",
      ),
    );
  const cl = new ethers.Contract(
    clAddr,
    art(
      "StableClubConcentratedLiquidityExecutor.sol/StableClubConcentratedLiquidityExecutor.json",
    ).abi,
    wallet,
  );
  const strategyRegistry = new ethers.Contract(
    create.contracts.strategyRegistry.address,
    art("StrategyPermissionRegistry.sol/StrategyPermissionRegistry.json").abi,
    wallet,
  );
  const permissionRegistry = new ethers.Contract(
    create.contracts.permissionRegistry.address,
    art("PermissionRegistry.sol/PermissionRegistry.json").abi,
    wallet,
  );
  const oracleGuard = new ethers.Contract(
    create.contracts.oracleGuard.address,
    art("OracleGuard.sol/OracleGuard.json").abi,
    wallet,
  );

  const adapters = [];
  for (const a of adaptersMeta) {
    const name =
      a.protocol === "uniswap-v3" ? "UniswapV3Adapter" : "AerodromeSlipstreamAdapter";
    const contract = new ethers.Contract(
      a.adapter,
      art(`adapters/${name}.sol/${name}.json`).abi,
      wallet,
    );
    adapters.push({
      ...a,
      address: a.adapter,
      contract,
      dualSwap: a.tokenA.toLowerCase() !== USDC.toLowerCase(),
      swapRoute:
        a.poolAddress.toLowerCase() === "0x4e962bb3889bf030368f56810a9c96b83cb3e778"
          ? ROUTE_USDC_CBBTC_AERO_L
          : a.poolAddress.toLowerCase() === "0xfbb6eed8e7aa03b138556eedaf5d271a5e1e43ef"
            ? ROUTE_USDC_CBBTC_UNI
            : null,
      npm: a.npm,
    });
  }

  const usdc = new ethers.Contract(USDC, ERC20_ABI, wallet);
  const cbbtc = new ethers.Contract(CBBTC, ERC20_ABI, provider);
  const weth = new ethers.Contract(WETH, ERC20_ABI, provider);
  const resumeTxEarly = process.env.RESUME_DEPOSIT_TX?.trim();
  await sleep(300);
  const usdcBal = await usdc.balanceOf(wallet.address);
  // Tiny deposit — leave dust for fees rounding
  let grossUsdc = ethers.parseUnits("10", 6);
  if (!resumeTxEarly) {
    if (usdcBal < grossUsdc) {
      // use almost all, round down to 5 equal legs
      const usable = (usdcBal / 5n) * 5n;
      if (usable < ethers.parseUnits("5", 6)) {
        throw new Error(`Insufficient USDC: ${ethers.formatUnits(usdcBal, 6)}`);
      }
      grossUsdc = usable;
    }
  }
  console.log(
    JSON.stringify({
      phase: "start",
      user: wallet.address,
      clExecutor: clAddr,
      grossUsdc: resumeTxEarly ? "resume" : ethers.formatUnits(grossUsdc, 6),
      resumeTx: resumeTxEarly || null,
    }),
  );

  // --- register strategy ---
  const now = BigInt(Math.floor(Date.now() / 1000));
  const expiresAt = now + 86400n * 7n;
  const strategy = {
    user: wallet.address,
    chainId: 8453n,
    depositToken: USDC,
    allowedActions: ALL_ACTIONS,
    maxTotalPerTx: ethers.parseUnits("10000", 6),
    maxTotalPerDay: ethers.parseUnits("50000", 6),
    maxSlippageBps: 500n,
    minTimeBetweenExecutions: 0n,
    maxExecutionsPerDay: 50n,
    expiresAt,
    revoked: false,
    paused: false,
  };
  const legPermissions = [];
  const legsReg = [];
  for (let i = 0; i < 5; i++) {
    const a = adapters[i];
    const legPerm = {
      user: wallet.address,
      chainId: 8453n,
      poolId: a.poolId,
      tokenA: a.tokenA,
      tokenB: a.tokenB,
      allowedActions: ALL_ACTIONS,
      maxAmountPerTx: ethers.parseUnits("2000", 6),
      maxAmountPerDay: ethers.parseUnits("10000", 6),
      maxSlippageBps: 500n,
      minTimeBetweenExecutions: 0n,
      maxExecutionsPerDay: 50n,
      expiresAt,
      revoked: false,
      paused: false,
    };
    await sleep(200);
    const legPermissionId = await permissionRegistry.permissionIdFor(
      legPerm.user,
      legPerm.chainId,
      legPerm.poolId,
      legPerm.tokenA,
      legPerm.tokenB,
    );
    legPermissions.push(legPerm);
    legsReg.push({
      poolId: a.poolId,
      allocationBps: 2000n,
      adapter: a.address,
      tokenA: a.tokenA,
      tokenB: a.tokenB,
      legPermissionId,
      maxLegPerTx: ethers.parseUnits("2000", 6),
      maxLegPerDay: ethers.parseUnits("10000", 6),
    });
  }
  await sleep(500);
  let strategyId = await strategyRegistry.strategyIdFor(wallet.address, 8453n, USDC);
  const existing = await strategyRegistry.getStrategy(strategyId);
  if (existing.user && existing.user.toLowerCase() === wallet.address.toLowerCase() && !existing.revoked) {
    console.log(JSON.stringify({ phase: "strategy_reuse", strategyId }));
  } else {
    let tx = await strategyRegistry.registerFivePoolStrategy(strategy, legPermissions, legsReg);
    await tx.wait();
    await sleep(500);
    strategyId = await strategyRegistry.strategyIdFor(wallet.address, 8453n, USDC);
    console.log(JSON.stringify({ phase: "strategy_registered", strategyId, tx: tx.hash }));
  }

  // --- Permit2 ---
  const permit2 = new ethers.Contract(PERMIT2, PERMIT2_ABI, wallet);
  await sleep(400);
  let tx = await usdc.approve(PERMIT2, grossUsdc);
  await tx.wait();
  await sleep(400);
  const expiration = Number(now + 3600n);
  tx = await permit2.approve(USDC, clAddr, grossUsdc, expiration);
  await tx.wait();
  console.log(JSON.stringify({ phase: "permit2_approved" }));

  // --- build deposit legs ---
  async function oracleQuote(tokenOut, gross) {
    const net = (gross * 9900n) / 10000n;
    const decOut = tokenOut.toLowerCase() === WETH.toLowerCase() ? 18 : 8;
    await sleep(200);
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
    const a = adapters[i];
    await sleep(250);
    const pool = new ethers.Contract(a.poolAddress, POOL_ABI, provider);
    const spacing =
      a.protocol === "uniswap-v3" ? Number(await pool.tickSpacing()) : Number(a.tickSpacing);
    await sleep(200);
    const tick = await readPoolTick(provider, a.poolAddress);
    const tickLower = alignTick(tick - spacing * 10, spacing);
    const tickUpper = alignTick(tick + spacing * 10, spacing);

    if (!a.dualSwap) {
      const q = await oracleQuote(CBBTC, half);
      depositLegs.push({
        legIndex: i,
        adapter: a.address,
        tokenA: a.tokenA,
        tokenB: a.tokenB,
        tickLower,
        tickUpper,
        retainUsdc: half,
        swaps: [
          {
            routeId: a.swapRoute,
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
        adapter: a.address,
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

  const poolIds = adapters.map((a) => a.poolId);
  const resumeTx = process.env.RESUME_DEPOSIT_TX?.trim();
  let depositRec;
  if (resumeTx) {
    depositRec = await provider.getTransactionReceipt(resumeTx);
    if (!depositRec || depositRec.status !== 1) throw new Error(`RESUME_DEPOSIT_TX invalid: ${resumeTx}`);
    console.log(JSON.stringify({ phase: "deposit_resume", tx: resumeTx, block: depositRec.blockNumber }));
  } else {
    await sleep(400);
    // Prefer unused deposit nonce (1 may already be consumed by a prior live attempt).
    let depositNonce = 1n;
    for (let n = 1n; n <= 20n; n++) {
      await sleep(150);
      if (!(await strategyRegistry.strategyDepositNonceUsed(strategyId, n))) {
        depositNonce = n;
        break;
      }
      if (n === 20n) throw new Error("no free deposit nonce in 1..20");
    }
    tx = await cl.depositFivePoolStrategy(
      strategyId,
      depositNonce,
      grossUsdc,
      poolIds,
      deadline,
      depositLegs,
    );
    depositRec = await tx.wait();
    if (depositRec.status !== 1) throw new Error("deposit reverted");
    console.log(
      JSON.stringify({
        phase: "deposit",
        tx: depositRec.hash,
        nonce: depositNonce.toString(),
        gasUsed: depositRec.gasUsed.toString(),
      }),
    );
  }

  // --- collect NFTs from deposit receipt (avoid eth_getLogs range limits) ---
  const transferIface = new ethers.Interface([
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  ]);
  const mintCandidates = [];
  for (const log of depositRec.logs) {
    try {
      const parsed = transferIface.parseLog(log);
      if (
        parsed &&
        parsed.args.from === ethers.ZeroAddress &&
        parsed.args.to.toLowerCase() === wallet.address.toLowerCase()
      ) {
        mintCandidates.push({ npm: log.address, tokenId: parsed.args.tokenId });
      }
    } catch {
      // not an ERC721 Transfer
    }
  }

  const positions = [];
  const usedTokenIds = new Set();
  for (const a of adapters) {
    const npm = new ethers.Contract(
      a.npm,
      [
        "function approve(address to, uint256 tokenId)",
        "function ownerOf(uint256 tokenId) view returns (address)",
      ],
      wallet,
    );
    let tokenId;
    for (let i = mintCandidates.length - 1; i >= 0; i--) {
      const candidate = mintCandidates[i];
      if (candidate.npm.toLowerCase() !== a.npm.toLowerCase()) continue;
      const key = `${candidate.npm}:${candidate.tokenId.toString()}`;
      if (usedTokenIds.has(key)) continue;
      try {
        await sleep(150);
        if ((await a.contract.ownerOf(candidate.tokenId)).toLowerCase() !== wallet.address.toLowerCase()) {
          continue;
        }
        await sleep(150);
        const [t0, t1] = await a.contract.positionTokens(candidate.tokenId);
        const [e0, e1] =
          a.tokenA.toLowerCase() < a.tokenB.toLowerCase()
            ? [a.tokenA, a.tokenB]
            : [a.tokenB, a.tokenA];
        if (t0.toLowerCase() !== e0.toLowerCase() || t1.toLowerCase() !== e1.toLowerCase()) {
          continue;
        }
        await sleep(150);
        const amounts = await a.contract.positionAmounts(candidate.tokenId);
        if (amounts[0] + amounts[1] === 0n) continue;
        tokenId = candidate.tokenId;
        usedTokenIds.add(key);
        break;
      } catch {
        // continue
      }
    }
    if (tokenId === undefined) throw new Error(`NFT not found for ${a.poolId}`);
    positions.push({ adapter: a, tokenId, npm });
  }
  console.log(
    JSON.stringify({
      phase: "positions",
      count: positions.length,
      tokenIds: positions.map((p) => p.tokenId.toString()),
    }),
  );
  if (positions.length !== 5) throw new Error("expected 5 positions");

  // --- approve NFTs + harvest + compound ---
  const skipManage = process.env.SKIP_HARVEST_COMPOUND === "1";
  const manageLegs = [];
  for (let i = 0; i < 5; i++) {
    const p = positions[i];
    await sleep(400);
    tx = await p.npm.approve(p.adapter.address, p.tokenId);
    await tx.wait();
    manageLegs.push({
      legIndex: i,
      adapter: p.adapter.address,
      tokenA: p.adapter.tokenA,
      tokenB: p.adapter.tokenB,
      positionTokenId: p.tokenId,
      amountAMin: 0n,
      amountBMin: 0n,
      slippageBps: 500n,
    });
  }

  let harvestRec = { hash: skipManage ? "skipped" : null };
  let compoundRec = { hash: skipManage ? "skipped" : null };
  if (!skipManage) {
    await sleep(500);
    tx = await cl.harvestAll(strategyId, manageLegs, 100n);
    harvestRec = await tx.wait();
    if (harvestRec.status !== 1) throw new Error("harvest reverted");
    console.log(JSON.stringify({ phase: "harvest", tx: harvestRec.hash }));

    await sleep(500);
    tx = await cl.compoundAll(strategyId, manageLegs, 200n);
    compoundRec = await tx.wait();
    if (compoundRec.status !== 1) throw new Error("compound reverted");
    console.log(JSON.stringify({ phase: "compound", tx: compoundRec.hash }));
  } else {
    console.log(JSON.stringify({ phase: "harvest_compound_skipped" }));
  }

  // --- exitAllToUsdc ---
  // positionAmounts underestimates unpaid fee growth → ResidualNonUsdc unless amountIn
  // matches actual close proceeds. Binary-search pads via staticCall, then broadcast.
  const exitLegs = [];
  let aggCb = 0n;
  let aggWeth = 0n;
  for (let i = 0; i < 5; i++) {
    const p = positions[i];
    await sleep(250);
    const amounts = await p.adapter.contract.positionAmounts(p.tokenId);
    await sleep(200);
    const [t0, t1] = await p.adapter.contract.positionTokens(p.tokenId);
    if (t0.toLowerCase() === CBBTC.toLowerCase()) aggCb += amounts[0];
    if (t1.toLowerCase() === CBBTC.toLowerCase()) aggCb += amounts[1];
    if (t0.toLowerCase() === WETH.toLowerCase()) aggWeth += amounts[0];
    if (t1.toLowerCase() === WETH.toLowerCase()) aggWeth += amounts[1];
    exitLegs.push({
      legIndex: i,
      adapter: p.adapter.address,
      tokenA: p.adapter.tokenA,
      tokenB: p.adapter.tokenB,
      positionTokenId: p.tokenId,
      liquidity: 0n,
      amountAMin: 1n,
      amountBMin: 1n,
      slippageBps: 500n,
      fullExit: true,
    });
  }

  const exitNonceBase = 300n;
  async function buildSwaps(cbAmt, wethAmt) {
    const exitDeadline = BigInt(Math.floor(Date.now() / 1000)) + 3600n;
    const swaps = Array.from({ length: 8 }, () => ({
      routeId: ethers.ZeroHash,
      amountIn: 0n,
      minOut: 0n,
      quotedOut: 0n,
      deadline: 0n,
    }));
    let swapCount = 0;
    if (cbAmt > 0n) {
      await sleep(150);
      const quoted = await oracleGuard.expectedAmountOut(CBBTC, USDC, cbAmt, 8, 6);
      swaps[swapCount++] = {
        routeId: ROUTE_CBBTC_USDC_UNI,
        amountIn: cbAmt,
        minOut: (quoted * 9900n) / 10000n,
        quotedOut: quoted,
        deadline: exitDeadline,
      };
    }
    if (wethAmt > 0n) {
      await sleep(150);
      const quoted = await oracleGuard.expectedAmountOut(WETH, USDC, wethAmt, 18, 6);
      swaps[swapCount++] = {
        routeId: ROUTE_WETH_USDC_UNI,
        amountIn: wethAmt,
        minOut: (quoted * 9900n) / 10000n,
        quotedOut: quoted,
        deadline: exitDeadline,
      };
    }
    return { swaps, swapCount };
  }

  async function tryExitStatic(cbAmt, wethAmt) {
    const { swaps, swapCount } = await buildSwaps(cbAmt, wethAmt);
    try {
      const out = await cl.exitAllToUsdc.staticCall(
        strategyId,
        exitLegs,
        swaps,
        swapCount,
        1n,
        exitNonceBase,
      );
      return { ok: true, out, swaps, swapCount };
    } catch (e) {
      const data = e.data || e.info?.error?.data;
      let name = "unknown";
      try {
        name = cl.interface.parseError(data).name;
      } catch {
        if (typeof data === "string" && data.startsWith("0x08c379a0")) name = "ErrorString";
      }
      return { ok: false, name, swaps, swapCount };
    }
  }

  let cbIn = aggCb;
  let wethIn = aggWeth;
  let calibrated = await tryExitStatic(cbIn, wethIn);
  if (!calibrated.ok && calibrated.name === "ResidualNonUsdc") {
    // Binary-search WETH pad (fee-growth undercount); keep cbBTC at positionAmounts.
    let lo = 0n;
    let hi = 1_000_000_000n; // 1e9
    for (let i = 0; i < 24; i++) {
      await sleep(200);
      const r = await tryExitStatic(cbIn, wethIn + hi);
      console.log(JSON.stringify({ phase: "exit_probe", hi: hi.toString(), name: r.name, ok: r.ok }));
      if (r.ok) break;
      if (r.name === "ResidualNonUsdc") {
        lo = hi;
        hi *= 2n;
        continue;
      }
      break;
    }
    while (lo + 1n < hi) {
      const mid = (lo + hi) / 2n;
      await sleep(200);
      const r = await tryExitStatic(cbIn, wethIn + mid);
      if (r.ok) {
        hi = mid;
        calibrated = r;
      } else if (r.name === "ResidualNonUsdc") {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    await sleep(200);
    calibrated = await tryExitStatic(cbIn, wethIn + hi);
    if (!calibrated.ok) throw new Error(`exit calibrate failed after pad search hi=${hi}`);
    wethIn = wethIn + hi;
    console.log(
      JSON.stringify({
        phase: "exit_calibrated",
        cbIn: cbIn.toString(),
        wethIn: wethIn.toString(),
        wethPad: hi.toString(),
        staticUsdcOut: calibrated.out.toString(),
      }),
    );
  } else if (!calibrated.ok) {
    throw new Error(`exit staticCall failed: ${calibrated.name}`);
  } else {
    console.log(JSON.stringify({ phase: "exit_calibrated", pad: 0, staticUsdcOut: calibrated.out.toString() }));
  }

  // Rebuild swaps fresh (deadline) at calibrated amounts immediately before broadcast.
  const { swaps, swapCount } = await buildSwaps(cbIn, wethIn);

  await sleep(300);
  const usdcBefore = await usdc.balanceOf(wallet.address);
  await sleep(200);
  const cbbtcBefore = await cbbtc.balanceOf(wallet.address);
  await sleep(200);
  const wethBefore = await weth.balanceOf(wallet.address);

  await sleep(300);
  // Final static confirm then send
  try {
    await cl.exitAllToUsdc.staticCall(strategyId, exitLegs, swaps, swapCount, 1n, exitNonceBase);
  } catch (e) {
    throw new Error(`exit preflight failed: ${e.shortMessage || e.message}`);
  }
  tx = await cl.exitAllToUsdc(strategyId, exitLegs, swaps, swapCount, 1n, exitNonceBase);
  const exitRec = await tx.wait();
  if (exitRec.status !== 1) throw new Error("exitAllToUsdc reverted");

  await sleep(400);
  const usdcAfter = await usdc.balanceOf(wallet.address);
  await sleep(200);
  const cbbtcAfter = await cbbtc.balanceOf(wallet.address);
  await sleep(200);
  const wethAfter = await weth.balanceOf(wallet.address);

  const result = {
    phase: "done",
    ok: true,
    depositTx: depositRec.hash,
    harvestTx: harvestRec.hash,
    compoundTx: compoundRec.hash,
    exitTx: exitRec.hash,
    usdcBefore: ethers.formatUnits(usdcBefore, 6),
    usdcAfter: ethers.formatUnits(usdcAfter, 6),
    usdcDelta: ethers.formatUnits(usdcAfter - usdcBefore, 6),
    cbbtcUnchanged: cbbtcAfter === cbbtcBefore,
    wethUnchanged: wethAfter === wethBefore,
    cbbtcBefore: cbbtcBefore.toString(),
    cbbtcAfter: cbbtcAfter.toString(),
    wethBefore: wethBefore.toString(),
    wethAfter: wethAfter.toString(),
    positions: 5,
    neverCalledExitAll: true,
  };

  if (!(usdcAfter > usdcBefore)) throw new Error("USDC did not increase");
  if (cbbtcAfter !== cbbtcBefore) throw new Error("cbBTC residual — mixed asset leak");
  if (wethAfter !== wethBefore) throw new Error("WETH residual — mixed asset leak");

  const outPath = path.join(
    process.cwd(),
    "deployments/base-mainnet/safe-owned-stack-base-e2e.json",
  );
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, artifact: outPath }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
