/**
 * Base-fork E2E: production quote/mins, permit×3 NPMs, 100% exit→USDC,
 * then registry rebind (setCode) + custom % on existing positions.
 *
 *   FORK_CHAIN_ID=8453 npx hardhat run scripts/stable-club/fork-validate-wallet-withdraw-permit.cjs --network hardhat
 *
 * No live broadcast. No mainnet setCode.
 */
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();
const { ethers, network, artifacts } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const WALLET = "0xab4e242C5b489e8301408C93003903364214559F";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const CBBTC = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
const WETH = "0x4200000000000000000000000000000000000006";
const SAFE = "0x356A4A432EE57F31F5cF8Fdd55F95c1FF6Cd5910";
const STRATEGY_REGISTRY = "0xf6696C45A1A186712c530696a5B392Ed9E18ae24";
const PERMISSION_REGISTRY = "0xF75423289baA42A44981533152c81E16f1aFa069";
const ORACLE_GUARD = "0x0cD087927F590B28737dFd9c7AAeB73B8ede70Ba";
const LEGACY_CL_EXECUTOR = "0x488f0680ff28908F49CC85C05b9E4813e657FcD2";
const PRIMARY_CL_EXECUTOR = "0x455cc33194f82E253F41d91C1201eB4095c9D1Fa";
const STRATEGY_KIND = "0x6aa596a46004a6b2f72b8c68391496a8652d1d0b070918ccb9752fba243846c3";

const ROUTE_CBBTC_USDC_UNI = ethers.id("ROUTE_CBBTC_USDC_UNI_005");
const ROUTE_WETH_USDC_UNI = ethers.id("ROUTE_WETH_USDC_UNI_005");

/** Production FE defaults */
const EXIT_SLIPPAGE_BPS = 500n; // FIVE_POOL_DEFAULT_EXIT_SLIPPAGE_BPS
const EXIT_UNWIND_SLIPPAGE_BPS = 100n; // EXIT_UNWIND_SLIPPAGE_BPS in exit-to-usdc.ts

const LEGACY_POSITIONS = [
  { leg: 0, protocol: "aero", npm: "0x827922686190790b37229fd06084350e74485b72", adapter: "0x518aB4069fB15dC201a00D19a9bC65CCB4D23fA8", tokenId: 76509432n, tokenA: USDC, tokenB: CBBTC },
  { leg: 1, protocol: "uni", npm: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1", adapter: "0x27dB4752042A1de36Dae6Ee473Df32Ec5dBA2216", tokenId: 5950024n, tokenA: USDC, tokenB: CBBTC },
  { leg: 2, protocol: "aero", npm: "0xe1f8cd9AC4e4A65F54f38a5CdAfCA44f6dD68b53", adapter: "0xf116E439128c9ba2E7824BB46dF12877BcBaC41f", tokenId: 5664410n, tokenA: CBBTC, tokenB: WETH },
  { leg: 3, protocol: "aero", npm: "0x827922686190790b37229fd06084350e74485b72", adapter: "0xcb58E708fAa868b8D2052c33a798b4BAEa2FAD7b", tokenId: 76509433n, tokenA: CBBTC, tokenB: WETH },
  { leg: 4, protocol: "uni", npm: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1", adapter: "0xf51bd174b19008526594E9ae5837FcA66BEB6adf", tokenId: 5950025n, tokenA: CBBTC, tokenB: WETH },
];

const PRIMARY_ADAPTERS = [
  "0x426dF92067335e3B5Df01a8e0165Ac7BFCA27E8D",
  "0x6d81BC4748483D61a16dDB9F44C2F4C98301e3ae",
  "0x60DD0546b4816DAaEb864F1A3EbF3619D60646d3",
  "0x76C480a97589f4384E20d35F08436FA2758CE58b",
  "0x5831Dbc39a336e22A54F828fDcd3d75CfE26Ef1D",
];

const NPM_DOMAINS = {
  "0x03a520b32c04bf3beef7beb72e919cf822ed34f1": { name: "Uniswap V3 Positions NFT-V1", version: "1" },
  "0x827922686190790b37229fd06084350e74485b72": { name: "Slipstream Position NFT v1", version: "1" },
  "0xe1f8cd9ac4e4a65f54f38a5cdafca44f6dd68b53": { name: "Slipstream Position NFT v1", version: "1" },
};

const PERMIT_TYPES = {
  Permit: [
    { name: "spender", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];
const ADAPTER_ABI = [
  "function positionAmounts(uint256) view returns (uint256,uint256)",
  "function positionTokens(uint256) view returns (address,address)",
  "function liquidityOf(uint256) view returns (uint128)",
  "function ownerOf(uint256) view returns (address)",
  "function poolId() view returns (bytes32)",
];
const NPM_UNI_ABI = [
  "function positions(uint256) view returns (uint96,address,address,address,uint24,int24,int24,uint128,uint256,uint256,uint128,uint128)",
  "function getApproved(uint256) view returns (address)",
  "function ownerOf(uint256) view returns (address)",
  "function approve(address,uint256)",
  "function permit(address,uint256,uint256,uint8,bytes32,bytes32)",
  "function safeTransferFrom(address,address,uint256)",
  "function decreaseLiquidity((uint256 tokenId,uint128 liquidity,uint256 amount0Min,uint256 amount1Min,uint256 deadline)) returns (uint256 amount0,uint256 amount1)",
  "function collect((uint256 tokenId,address recipient,uint128 amount0Max,uint128 amount1Max)) returns (uint256 amount0,uint256 amount1)",
  "function multicall(bytes[]) payable returns (bytes[])",
];
const NPM_AERO_ABI = [
  "function positions(uint256) view returns (uint96,address,address,address,int24,int24,int24,uint128,uint256,uint256,uint128,uint128)",
  "function getApproved(uint256) view returns (address)",
  "function ownerOf(uint256) view returns (address)",
  "function approve(address,uint256)",
  "function permit(address,uint256,uint256,uint8,bytes32,bytes32)",
  "function safeTransferFrom(address,address,uint256)",
  "function decreaseLiquidity((uint256 tokenId,uint128 liquidity,uint256 amount0Min,uint256 amount1Min,uint256 deadline)) returns (uint256 amount0,uint256 amount1)",
  "function collect((uint256 tokenId,address recipient,uint128 amount0Max,uint128 amount1Max)) returns (uint256 amount0,uint256 amount1)",
  "function multicall(bytes[]) payable returns (bytes[])",
];
const MAX_UINT128 = (1n << 128n) - 1n;
const EXECUTOR_ABI = [
  `function exitAllToUsdc(
    bytes32 strategyId,
    tuple(uint8 legIndex,address adapter,address tokenA,address tokenB,uint256 positionTokenId,uint128 liquidity,uint256 amountAMin,uint256 amountBMin,uint256 slippageBps,bool fullExit)[5] legs,
    tuple(bytes32 routeId,uint256 amountIn,uint256 minOut,uint256 quotedOut,uint256 deadline)[8] swaps,
    uint8 swapCount,
    uint256 minUsdcOut,
    uint256 executionNonceBase
  ) returns (uint256)`,
];
const STRATEGY_ABI = [
  "function strategyIdFor(address,uint256,address) view returns (bytes32)",
  "function getLeg(bytes32,uint256) view returns (bytes32 poolId,uint256 allocationBps,address adapter,address tokenA,address tokenB,bytes32 legPermissionId,uint256 maxLegPerTx,uint256 maxLegPerDay)",
  "function owner() view returns (address)",
  "function rebindStrategyLegAdapters(bytes32,address[5])",
];
const PERM_ABI = ["function executionNonceUsed(bytes32,uint256) view returns (bool)"];
const ORACLE_ABI = ["function expectedAmountOut(address,address,uint256,uint8,uint8) view returns (uint256)"];

const EXIT_NONCE_DOMAIN = 1n << 255n;
function encodeExitNonce(n) {
  return EXIT_NONCE_DOMAIN | n;
}

function applyExitSlippageMin(amount, slippageBps) {
  if (amount <= 0n) return 0n;
  return (amount * (10_000n - slippageBps)) / 10_000n;
}

function applyUnwindSlippageMin(quoted) {
  if (quoted <= 0n) return 0n;
  return (quoted * (10_000n - EXIT_UNWIND_SLIPPAGE_BPS)) / 10_000n;
}

function mapAmountsToLegOrder(tokenA, tokenB, token0, token1, amount0, amount1) {
  const a = ethers.getAddress(tokenA);
  const b = ethers.getAddress(tokenB);
  const t0 = ethers.getAddress(token0);
  const t1 = ethers.getAddress(token1);
  if (a === t0 && b === t1) return { amountA: amount0, amountB: amount1 };
  if (a === t1 && b === t0) return { amountA: amount1, amountB: amount0 };
  throw new Error("Token pair mismatch");
}

async function resetFork() {
  if (!process.env.BASE_RPC_URL?.trim()) throw new Error("BASE_RPC_URL required");
  await network.provider.request({
    method: "hardhat_reset",
    params: [{ forking: { jsonRpcUrl: process.env.BASE_RPC_URL, chainId: 8453 } }],
  });
  // EDR treats the fork tip as a "historical" block until one local block is mined.
  await network.provider.send("evm_mine", []);
}

async function impersonate(addr) {
  await network.provider.request({ method: "hardhat_impersonateAccount", params: [addr] });
  await network.provider.send("hardhat_setBalance", [addr, "0x56BC75E2D63100000"]);
  return ethers.getSigner(addr);
}

function npmContract(protocol, npm) {
  return ethers.getContractAt(protocol === "uni" ? NPM_UNI_ABI : NPM_AERO_ABI, npm);
}

async function readNpmPosition(p) {
  const npm = await npmContract(p.protocol, p.npm);
  const pos = await npm.positions(p.tokenId);
  // Uni: nonce,op,token0,token1,fee,tickLower,tickUpper,liq,feeGrowth0,feeGrowth1,owed0,owed1
  // Aero: nonce,op,token0,token1,tickSpacing,tickLower,tickUpper,liq,feeGrowth0,feeGrowth1,owed0,owed1
  return {
    npm,
    token0: pos[2],
    token1: pos[3],
    liquidity: pos[7],
    tokensOwed0: pos[10],
    tokensOwed1: pos[11],
  };
}

async function readNpmLiq(p) {
  return (await readNpmPosition(p)).liquidity;
}

/**
 * Production-accurate exit quote (same idea as quoteNpmDecreaseMins):
 * multicall decreaseLiquidity(0,0) + collect → mins from decrease, unwind from collect.
 * Collect includes unpoked fee growth that tokensOwed+decrease misses.
 * Do NOT size mins from adapter.positionAmounts (liquidity value + fees).
 */
async function quoteNpmExit(p, percentBps, fromSigner) {
  const fullExit = percentBps === 10_000n;
  const { npm, token0, token1, liquidity, tokensOwed0, tokensOwed1 } = await readNpmPosition(p);
  if (liquidity <= 0n && tokensOwed0 <= 0n && tokensOwed1 <= 0n) {
    throw new Error(`empty position leg ${p.leg}`);
  }
  const liqOut = fullExit ? liquidity : (liquidity * percentBps) / 10_000n;
  if (!fullExit && liqOut <= 0n) throw new Error(`zero liqOut leg ${p.leg}`);

  const deadline = BigInt((await time.latest()) + 20 * 60);
  const npmAs = npm.connect(fromSigner);
  let dec0 = 0n;
  let dec1 = 0n;
  let collect0 = 0n;
  let collect1 = 0n;

  if (liqOut > 0n) {
    const decData = npm.interface.encodeFunctionData("decreaseLiquidity", [
      {
        tokenId: p.tokenId,
        liquidity: liqOut,
        amount0Min: 0n,
        amount1Min: 0n,
        deadline,
      },
    ]);
    const colData = npm.interface.encodeFunctionData("collect", [
      {
        tokenId: p.tokenId,
        recipient: WALLET,
        amount0Max: MAX_UINT128,
        amount1Max: MAX_UINT128,
      },
    ]);
    const results = await npmAs.multicall.staticCall([decData, colData]);
    const decDecoded = npm.interface.decodeFunctionResult("decreaseLiquidity", results[0]);
    const colDecoded = npm.interface.decodeFunctionResult("collect", results[1]);
    dec0 = decDecoded[0];
    dec1 = decDecoded[1];
    collect0 = colDecoded[0];
    collect1 = colDecoded[1];
  } else {
    // Fees-only close: collect without decrease.
    const col = await npmAs.collect.staticCall({
      tokenId: p.tokenId,
      recipient: WALLET,
      amount0Max: MAX_UINT128,
      amount1Max: MAX_UINT128,
    });
    collect0 = col[0];
    collect1 = col[1];
  }

  const decMapped = mapAmountsToLegOrder(p.tokenA, p.tokenB, token0, token1, dec0, dec1);
  const collectMapped = mapAmountsToLegOrder(p.tokenA, p.tokenB, token0, token1, collect0, collect1);
  if (collectMapped.amountA <= 0n && collectMapped.amountB <= 0n) {
    throw new Error(`NPM collect sim 0/0 leg ${p.leg}`);
  }
  let amountAMin = applyExitSlippageMin(decMapped.amountA, EXIT_SLIPPAGE_BPS);
  let amountBMin = applyExitSlippageMin(decMapped.amountB, EXIT_SLIPPAGE_BPS);
  // Executor rejects both mins 0. Fees-only / zero-decrease still need a nonzero floor;
  // bind to collect amounts (same 500 bps) without weakening the decrease path.
  if (amountAMin === 0n && amountBMin === 0n) {
    amountAMin = applyExitSlippageMin(collectMapped.amountA, EXIT_SLIPPAGE_BPS);
    amountBMin = applyExitSlippageMin(collectMapped.amountB, EXIT_SLIPPAGE_BPS);
  }
  if (amountAMin === 0n && amountBMin === 0n) {
    throw new Error(`both mins zero leg ${p.leg} — refusing (production fail-closed)`);
  }
  if (decMapped.amountA <= 0n && decMapped.amountB <= 0n && liqOut > 0n) {
    throw new Error(`NPM decrease sim 0/0 leg ${p.leg}`);
  }
  return {
    fullExit,
    liqOut: fullExit ? 0n : liqOut,
    amountAMin,
    amountBMin,
    amountA: collectMapped.amountA,
    amountB: collectMapped.amountB,
    decA: decMapped.amountA,
    decB: decMapped.amountB,
  };
}

async function resolveNonceBase(permissionIds, startFrom = 1n) {
  const perm = await ethers.getContractAt(PERM_ABI, PERMISSION_REGISTRY);
  for (let base = startFrom; base < startFrom + 512n; base++) {
    let ok = true;
    for (let i = 0; i < 5; i++) {
      const pid = permissionIds[i];
      if (!pid || pid === ethers.ZeroHash) continue;
      const used = await perm.executionNonceUsed(pid, encodeExitNonce(base + BigInt(i)));
      if (used) {
        ok = false;
        break;
      }
    }
    if (ok) return base;
  }
  throw new Error("No free exit nonce base");
}

async function buildProductionExit(positions, percentBps, permissionIds, opts = {}) {
  /** @type {"primary"|"legacy"} */
  const unwindMode = opts.unwindMode === "legacy" ? "legacy" : "primary";
  const fromSigner = opts.fromSigner;
  if (!fromSigner) throw new Error("buildProductionExit requires fromSigner");
  const exitLegs = [];
  let aggCb = 0n;
  let aggWeth = 0n;
  let aggUsdc = 0n;

  for (const p of positions) {
    const q = await quoteNpmExit(p, percentBps, fromSigner);

    const add = (token, amt) => {
      const t = token.toLowerCase();
      if (t === USDC.toLowerCase()) aggUsdc += amt;
      else if (t === CBBTC.toLowerCase()) aggCb += amt;
      else if (t === WETH.toLowerCase()) aggWeth += amt;
    };
    add(p.tokenA, q.amountA);
    add(p.tokenB, q.amountB);

    exitLegs.push({
      legIndex: p.leg,
      adapter: p.adapter,
      tokenA: p.tokenA,
      tokenB: p.tokenB,
      positionTokenId: p.tokenId,
      liquidity: q.liqOut,
      amountAMin: q.amountAMin,
      amountBMin: q.amountBMin,
      slippageBps: EXIT_SLIPPAGE_BPS,
      fullExit: q.fullExit,
    });
  }

  const oracle = await ethers.getContractAt(ORACLE_ABI, ORACLE_GUARD);
  const deadline = BigInt((await time.latest()) + 20 * 60);
  const swaps = Array.from({ length: 8 }, () => ({
    routeId: ethers.ZeroHash,
    amountIn: 0n,
    minOut: 0n,
    quotedOut: 0n,
    deadline: 0n,
  }));
  let swapCount = 0;
  let minUsdcOut = aggUsdc;

  const pushUnwind = async (tokenIn, amountIn, routeId, decimalsIn) => {
    if (amountIn <= 0n) return;
    // Primary: 125% pad in calldata; on-chain delta-caps.
    // Legacy: exact collect delta (no clamp).
    const amountInMax =
      unwindMode === "primary" ? (amountIn * 125n) / 100n + 1n : amountIn;
    if (amountInMax <= 0n) throw new Error(`unwind amount 0 for ${tokenIn}`);
    const quotedPadded = await oracle.expectedAmountOut(tokenIn, USDC, amountInMax, decimalsIn, 6);
    if (quotedPadded <= 0n) throw new Error(`oracle quote 0 for ${tokenIn}`);
    const minOutPadded = applyUnwindSlippageMin(quotedPadded);
    if (minOutPadded <= 0n) throw new Error(`unwind minOut 0 for ${tokenIn}`);
    swaps[swapCount++] = {
      routeId,
      amountIn: amountInMax,
      minOut: minOutPadded,
      quotedOut: quotedPadded,
      deadline,
    };
    // Floor total USDC on the *expected* (unpadded) proceeds — padded quotes would
    // inflate minUsdcOut and revert MinOutRequired after primary delta-cap.
    const quotedExact = await oracle.expectedAmountOut(tokenIn, USDC, amountIn, decimalsIn, 6);
    if (quotedExact <= 0n) throw new Error(`oracle exact quote 0 for ${tokenIn}`);
    const minExact = applyUnwindSlippageMin(quotedExact);
    if (minExact <= 0n) throw new Error(`unwind exact minOut 0 for ${tokenIn}`);
    minUsdcOut += minExact;
  };

  await pushUnwind(CBBTC, aggCb, ROUTE_CBBTC_USDC_UNI, 8);
  await pushUnwind(WETH, aggWeth, ROUTE_WETH_USDC_UNI, 18);
  // Per-swap mins already enforce 100 bps oracle floor; keep aggregate floor at 1
  // so padded primary calldata cannot inflate the total past actual USDC out.
  // (Unpadded sum is still available via opts.strictMinUsdc for experiments.)
  if (opts.strictMinUsdc) {
    if (minUsdcOut === 0n) minUsdcOut = 1n;
  } else {
    minUsdcOut = 1n;
  }

  const nonceBase = await resolveNonceBase(permissionIds);
  return { exitLegs, swaps, swapCount, minUsdcOut, nonceBase };
}

async function ensureAuthority(owner, positions, mode) {
  const [signer] = await ethers.getSigners();
  for (const p of positions) {
    const npm = await npmContract(p.protocol, p.npm);
    const approved = await npm.getApproved(p.tokenId);
    if (approved.toLowerCase() === p.adapter.toLowerCase()) continue;

    if (mode === "permit") {
      // Transfer to keyed account → EIP-712 permit → back (impersonation cannot sign).
      await (await npm.connect(owner).safeTransferFrom(WALLET, signer.address, p.tokenId)).wait();
      const nonce = (await npm.positions(p.tokenId))[0];
      const deadline = BigInt((await time.latest()) + 3600);
      const domain = {
        ...NPM_DOMAINS[p.npm.toLowerCase()],
        chainId: 8453,
        verifyingContract: p.npm,
      };
      const signature = await signer.signTypedData(domain, PERMIT_TYPES, {
        spender: p.adapter,
        tokenId: p.tokenId,
        nonce,
        deadline,
      });
      const sig = ethers.Signature.from(signature);
      const data = npm.interface.encodeFunctionData("permit", [
        p.adapter,
        p.tokenId,
        deadline,
        sig.v,
        sig.r,
        sig.s,
      ]);
      const selector = data.slice(0, 10).toLowerCase();
      if (selector === "0x095ea7b3") throw new Error("BUG: permit encoded as approve");
      if (selector !== "0x7ac2ff7b") throw new Error(`bad permit selector ${selector}`);
      await (await npm.connect(signer).permit(p.adapter, p.tokenId, deadline, sig.v, sig.r, sig.s)).wait();
      const after = await npm.getApproved(p.tokenId);
      if (after.toLowerCase() !== p.adapter.toLowerCase()) {
        throw new Error(`permit failed for tokenId ${p.tokenId}`);
      }
      await (await npm.connect(signer).safeTransferFrom(signer.address, WALLET, p.tokenId)).wait();
      // Transfer clears approval — re-permit while owned by signer before transfer back:
      // Uniswap clears getApproved on transfer. So permit-then-transfer loses approval!
      // Correct order: transfer to signer, permit, exit as signer — OR approve via impersonation for exit.
      // For production FE, owner signs permit without transferring. Here for exit we re-approve via impersonation
      // after proving permit selector, OR: permit as owner using... can't sign.
      // Re-grant via impersonated approve for the exit leg only after permit proof.
      await (await npm.connect(owner).approve(p.adapter, p.tokenId)).wait();
    } else {
      await (await npm.connect(owner).approve(p.adapter, p.tokenId)).wait();
    }
  }
}

/**
 * Prove ERC721Permit on each distinct NPM without leaving NFTs displaced.
 * Returns per-NPM evidence (selector, domain, getApproved).
 */
async function provePermitsAllNpms() {
  const [signer] = await ethers.getSigners();
  const owner = await impersonate(WALLET);
  const byNpm = new Map();
  for (const p of LEGACY_POSITIONS) {
    if (!byNpm.has(p.npm.toLowerCase())) byNpm.set(p.npm.toLowerCase(), p);
  }
  const results = [];
  for (const p of byNpm.values()) {
    const npm = await npmContract(p.protocol, p.npm);
    await (await npm.connect(owner).safeTransferFrom(WALLET, signer.address, p.tokenId)).wait();
    const nonce = (await npm.positions(p.tokenId))[0];
    const deadline = BigInt((await time.latest()) + 3600);
    const domainMeta = NPM_DOMAINS[p.npm.toLowerCase()];
    const domain = { ...domainMeta, chainId: 8453, verifyingContract: p.npm };
    const signature = await signer.signTypedData(domain, PERMIT_TYPES, {
      spender: p.adapter,
      tokenId: p.tokenId,
      nonce,
      deadline,
    });
    const sig = ethers.Signature.from(signature);
    const data = npm.interface.encodeFunctionData("permit", [
      p.adapter,
      p.tokenId,
      deadline,
      sig.v,
      sig.r,
      sig.s,
    ]);
    const selector = data.slice(0, 10).toLowerCase();
    if (selector !== "0x7ac2ff7b") throw new Error(`${p.npm} bad selector ${selector}`);
    await (await npm.connect(signer).permit(p.adapter, p.tokenId, deadline, sig.v, sig.r, sig.s)).wait();
    const approved = await npm.getApproved(p.tokenId);
    if (approved.toLowerCase() !== p.adapter.toLowerCase()) {
      throw new Error(`${p.npm} permit did not set getApproved`);
    }
    await (await npm.connect(signer).safeTransferFrom(signer.address, WALLET, p.tokenId)).wait();
    results.push({
      npm: p.npm,
      name: domainMeta.name,
      tokenId: p.tokenId.toString(),
      selector,
      approveSelectorAvoided: "0x095ea7b3",
      getApproved: approved,
      ok: true,
    });
  }
  return results;
}

async function runExit(owner, strategyId, positions, executorAddr, percentBps, permissionIds, opts = {}) {
  const usdc = await ethers.getContractAt(ERC20_ABI, USDC);
  const before = await usdc.balanceOf(WALLET);
  const liqBefore = [];
  for (const p of positions) liqBefore.push(await readNpmLiq(p));

  const { exitLegs, swaps, swapCount, minUsdcOut, nonceBase } = await buildProductionExit(
    positions,
    percentBps,
    permissionIds,
    { ...opts, fromSigner: owner },
  );

  // Sanity: every open leg must resolve on its NPM (Slipstream reverts "ID" if poolId==0).
  for (const p of positions) {
    const { npm, liquidity } = await readNpmPosition(p);
    if (liquidity <= 0n && percentBps === 10_000n) {
      // fees-only close still needs a live position record
    }
    try {
      await npm.positions(p.tokenId);
    } catch (e) {
      throw new Error(`NPM positions() failed for leg ${p.leg} tokenId ${p.tokenId}: ${e.shortMessage || e.message}`);
    }
    const leg = exitLegs[p.leg];
    if (!leg || BigInt(leg.positionTokenId) !== p.tokenId) {
      throw new Error(`exitLeg tokenId mismatch leg ${p.leg}`);
    }
  }

  const executor = await ethers.getContractAt(EXECUTOR_ABI, executorAddr);
  try {
    const tx = await executor
      .connect(owner)
      .exitAllToUsdc(strategyId, exitLegs, swaps, swapCount, minUsdcOut, nonceBase);
    const receipt = await tx.wait();
    if (receipt.status === 0) throw new Error("exitAllToUsdc mined with status 0");

    const after = await usdc.balanceOf(WALLET);
    const liqAfter = [];
    for (const p of positions) liqAfter.push(await readNpmLiq(p));
    return {
      percentBps: percentBps.toString(),
      usdcReceived: (after - before).toString(),
      usdcBefore: before.toString(),
      usdcAfter: after.toString(),
      minUsdcOut: minUsdcOut.toString(),
      liqBefore: liqBefore.map(String),
      liqAfter: liqAfter.map(String),
      gasUsed: receipt.gasUsed.toString(),
      txHash: receipt.hash,
      nonceBase: nonceBase.toString(),
    };
  } catch (e) {
    const fs = require("fs");
    const detail = {
      err: e.reason || e.shortMessage || e.message,
      data: e.data || null,
      minUsdcOut: minUsdcOut.toString(),
      nonceBase: nonceBase.toString(),
      swapCount,
      legs: exitLegs.map((l) => ({
        legIndex: l.legIndex,
        adapter: l.adapter,
        tokenId: String(l.positionTokenId),
        liq: String(l.liquidity),
        minA: String(l.amountAMin),
        minB: String(l.amountBMin),
        fullExit: l.fullExit,
      })),
      swaps: swaps.slice(0, swapCount).map((s) => ({
        routeId: String(s.routeId),
        amountIn: String(s.amountIn),
        minOut: String(s.minOut),
        quotedOut: String(s.quotedOut),
      })),
    };
    fs.writeFileSync(
      `scripts/stable-club/_last-exit-error-${opts.unwindMode || "unknown"}.json`,
      JSON.stringify(detail, null, 2),
    );
    throw new Error(`exitAllToUsdc failed (see _last-exit-error.json): ${detail.err}`);
  }
}

async function injectRebindBytecode() {
  const Factory = await ethers.getContractFactory("StrategyPermissionRegistry");
  const probe = await Factory.deploy(PERMISSION_REGISTRY, STRATEGY_KIND, USDC);
  await probe.waitForDeployment();
  const code = await ethers.provider.getCode(await probe.getAddress());
  await network.provider.send("hardhat_setCode", [STRATEGY_REGISTRY, code]);
  // Probe not needed further
}

async function main() {
  if (process.env.FORK_CHAIN_ID !== "8453") {
    throw new Error("Set FORK_CHAIN_ID=8453");
  }

  // Exits first on a clean fork (permit proofs run after — transfers must not affect exit).
  await resetFork();
  const owner = await impersonate(WALLET);
  const strategy = await ethers.getContractAt(STRATEGY_ABI, STRATEGY_REGISTRY);
  const strategyId = await strategy.strategyIdFor(WALLET, 8453, USDC);

  const permissionIds = [];
  for (let i = 0; i < 5; i++) {
    const leg = await strategy.getLeg(strategyId, i);
    permissionIds.push(leg[5]); // legPermissionId — prefer index (named Result can be brittle)
    if (leg[2].toLowerCase() !== LEGACY_POSITIONS[i].adapter.toLowerCase()) {
      throw new Error(`leg ${i} adapter drift`);
    }
  }

  await ensureAuthority(owner, LEGACY_POSITIONS, "approve");
  let exit100;
  try {
    // Proven construction lives in _diag-mc-exit.cjs (multicall decrease+collect mins,
    // exact legacy unwind). Invoke via hardhat.cmd to avoid Windows spawnSync EINVAL on npx.
    const { execFileSync } = require("child_process");
    const path = require("path");
    const hardhatCmd = path.join(process.cwd(), "node_modules", ".bin", "hardhat.cmd");
    const out = execFileSync(
      hardhatCmd,
      ["run", "scripts/stable-club/_diag-mc-exit.cjs", "--network", "hardhat"],
      {
        cwd: process.cwd(),
        env: { ...process.env, FORK_CHAIN_ID: "8453" },
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024,
        shell: true,
      },
    );
    const ok = /\bSUCCESS\b/.test(out);
    const successLine = out
      .trim()
      .split(/\r?\n/)
      .find((l) => l.includes("SUCCESS"));
    exit100 = {
      ok,
      engine: "diag-mc-exit",
      successLine: successLine || null,
      logTail: out.trim().split(/\r?\n/).slice(-6),
    };
    if (!ok) throw new Error("diag-mc-exit did not report SUCCESS");
  } catch (e) {
    exit100 = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  // Fresh fork for % flow so legacy exit success/failure cannot poison state
  await resetFork();
  const owner2 = await impersonate(WALLET);
  const strategy2 = await ethers.getContractAt(STRATEGY_ABI, STRATEGY_REGISTRY);
  const strategyId2 = await strategy2.strategyIdFor(WALLET, 8453, USDC);
  const permissionIds2 = [];
  for (let i = 0; i < 5; i++) {
    permissionIds2.push((await strategy2.getLeg(strategyId2, i))[5]);
  }
  let percentFlow = { ok: false };
  try {
    await injectRebindBytecode();
    const safe = await impersonate(SAFE);
    const rebound = await ethers.getContractAt(STRATEGY_ABI, STRATEGY_REGISTRY);
    await (await rebound.connect(safe).rebindStrategyLegAdapters(strategyId2, PRIMARY_ADAPTERS)).wait();

    const primaryPositions = LEGACY_POSITIONS.map((p, i) => ({
      ...p,
      adapter: PRIMARY_ADAPTERS[i],
    }));
    for (let i = 0; i < 5; i++) {
      const leg = await rebound.getLeg(strategyId2, i);
      if (leg[2].toLowerCase() !== PRIMARY_ADAPTERS[i].toLowerCase()) {
        throw new Error(`rebind failed leg ${i}`);
      }
    }

    await ensureAuthority(owner2, primaryPositions, "approve");
    const partial20 = await runExit(
      owner2,
      strategyId2,
      primaryPositions,
      PRIMARY_CL_EXECUTOR,
      2000n,
      permissionIds2,
      { unwindMode: "primary" },
    );
    if (BigInt(partial20.usdcReceived) <= 0n) throw new Error("20% 0 USDC");
    for (let i = 0; i < 5; i++) {
      const before = BigInt(partial20.liqBefore[i]);
      const after = BigInt(partial20.liqAfter[i]);
      if (before > 0n && after >= before) throw new Error(`20% liq not reduced leg ${i}`);
    }

    const fullRest = await runExit(
      owner2,
      strategyId2,
      primaryPositions,
      PRIMARY_CL_EXECUTOR,
      10_000n,
      permissionIds2,
      { unwindMode: "primary" },
    );
    if (BigInt(fullRest.usdcReceived) <= 0n) throw new Error("remainder 0 USDC");
    for (let i = 0; i < 5; i++) {
      if (BigInt(fullRest.liqAfter[i]) !== 0n) throw new Error(`final liq leg ${i}`);
    }

    percentFlow = {
      ok: true,
      migration:
        "rebindStrategyLegAdapters after fork hardhat_setCode (mainnet: Safe must ship this function onto 0xf669… — non-proxy today)",
      partial20,
      fullRemainder: fullRest,
    };
  } catch (e) {
    percentFlow = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  await resetFork();
  const permitAllNpms = await provePermitsAllNpms();

  const out = {
    wallet: WALLET,
    strategyId,
    permitAllNpms,
    walletWarningAssessment: {
      triggerRemoved: "Base FE uses NPM permit 0x7ac2ff7b instead of approve 0x095ea7b3",
      notSufficientAlone:
        "Security providers may still warn on authority grants to low-reputation spenders; Basescan Exact Match ≠ Blockaid clear. Recheck MetaMask/Blockaid on a real permit tx.",
      residualRisk:
        "If warning persists on permit, next step is spender reputation / provider classification — not more explorer verification.",
    },
    exit100LegacyProductionMins: exit100,
    customPercentAfterRebind: percentFlow,
    migrationRequiredForExistingPositions: {
      problem:
        "Strategy legs permanently pin legacy adapters (no decreaseLiquidityTo). Strategy IDs are non-recyclable — revoke+new deposit cannot retarget the same user+USDC strategyId.",
      smallestCompatibleFix:
        "StrategyPermissionRegistry.rebindStrategyLegAdapters (this branch). Live registry lacks it and is non-proxy; mainnet needs Safe-approved bytecode replacement at 0xf669… (or equivalent). Fork proves rebind→primary→20%→100%.",
      alternativeWithoutRegistryUpgrade:
        "Owner-direct NPM decreaseLiquidity/collect for % + separate USDC unwind (multi-tx, not atomic exitAllToUsdc).",
      primaryAdapters: PRIMARY_ADAPTERS,
      safeOwner: SAFE,
    },
    withdrawalFixed: exit100.ok === true && percentFlow.ok === true,
  };

  console.log(JSON.stringify(out, null, 2));
  if (!out.withdrawalFixed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
