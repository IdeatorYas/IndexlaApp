require("dotenv").config({ path: ".env.local" });
const { ethers, network } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const WALLET = "0xab4e242C5b489e8301408C93003903364214559F";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const CBBTC = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
const WETH = "0x4200000000000000000000000000000000000006";
const STRATEGY_REGISTRY = "0xf6696C45A1A186712c530696a5B392Ed9E18ae24";
const PERMISSION_REGISTRY = "0xF75423289baA42A44981533152c81E16f1aFa069";
const ORACLE = "0x0cD087927F590B28737dFd9c7AAeB73B8ede70Ba";
const LEGACY_CL_EXECUTOR = "0x488f0680ff28908F49CC85C05b9E4813e657FcD2";
const MAX_UINT128 = (1n << 128n) - 1n;
const POSITIONS = [
  { leg: 0, protocol: "aero", npm: "0x827922686190790b37229fd06084350e74485b72", adapter: "0x518aB4069fB15dC201a00D19a9bC65CCB4D23fA8", tokenId: 76509432n, tokenA: USDC, tokenB: CBBTC },
  { leg: 1, protocol: "uni", npm: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1", adapter: "0x27dB4752042A1de36Dae6Ee473Df32Ec5dBA2216", tokenId: 5950024n, tokenA: USDC, tokenB: CBBTC },
  { leg: 2, protocol: "aero", npm: "0xe1f8cd9AC4e4A65F54f38a5CdAfCA44f6dD68b53", adapter: "0xf116E439128c9ba2E7824BB46dF12877BcBaC41f", tokenId: 5664410n, tokenA: CBBTC, tokenB: WETH },
  { leg: 3, protocol: "aero", npm: "0x827922686190790b37229fd06084350e74485b72", adapter: "0xcb58E708fAa868b8D2052c33a798b4BAEa2FAD7b", tokenId: 76509433n, tokenA: CBBTC, tokenB: WETH },
  { leg: 4, protocol: "uni", npm: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1", adapter: "0xf51bd174b19008526594E9ae5837FcA66BEB6adf", tokenId: 5950025n, tokenA: CBBTC, tokenB: WETH },
];
const NPM_UNI = [
  "function positions(uint256) view returns (uint96,address,address,address,uint24,int24,int24,uint128,uint256,uint256,uint128,uint128)",
  "function decreaseLiquidity((uint256 tokenId,uint128 liquidity,uint256 amount0Min,uint256 amount1Min,uint256 deadline)) returns (uint256 amount0,uint256 amount1)",
  "function collect((uint256 tokenId,address recipient,uint128 amount0Max,uint128 amount1Max)) returns (uint256 amount0,uint256 amount1)",
  "function multicall(bytes[]) payable returns (bytes[])",
  "function approve(address,uint256)",
  "function getApproved(uint256) view returns (address)",
];
const NPM_AERO = [
  "function positions(uint256) view returns (uint96,address,address,address,int24,int24,int24,uint128,uint256,uint256,uint128,uint128)",
  "function decreaseLiquidity((uint256 tokenId,uint128 liquidity,uint256 amount0Min,uint256 amount1Min,uint256 deadline)) returns (uint256 amount0,uint256 amount1)",
  "function collect((uint256 tokenId,address recipient,uint128 amount0Max,uint128 amount1Max)) returns (uint256 amount0,uint256 amount1)",
  "function multicall(bytes[]) payable returns (bytes[])",
  "function approve(address,uint256)",
  "function getApproved(uint256) view returns (address)",
];
const EXECUTOR_ABI = [`function exitAllToUsdc(
    bytes32 strategyId,
    tuple(uint8 legIndex,address adapter,address tokenA,address tokenB,uint256 positionTokenId,uint128 liquidity,uint256 amountAMin,uint256 amountBMin,uint256 slippageBps,bool fullExit)[5] legs,
    tuple(bytes32 routeId,uint256 amountIn,uint256 minOut,uint256 quotedOut,uint256 deadline)[8] swaps,
    uint8 swapCount, uint256 minUsdcOut, uint256 executionNonceBase
  ) returns (uint256)`];

function mapAB(tokenA, tokenB, token0, token1, amount0, amount1) {
  const A = ethers.getAddress(tokenA), B = ethers.getAddress(tokenB);
  const T0 = ethers.getAddress(token0), T1 = ethers.getAddress(token1);
  if (A === T0 && B === T1) return { amountA: amount0, amountB: amount1 };
  if (A === T1 && B === T0) return { amountA: amount1, amountB: amount0 };
  throw new Error("map fail");
}

async function main() {
  await network.provider.request({ method: "hardhat_reset", params: [{ forking: { jsonRpcUrl: process.env.BASE_RPC_URL, chainId: 8453 } }] });
  await network.provider.send("evm_mine", []);
  await network.provider.request({ method: "hardhat_impersonateAccount", params: [WALLET] });
  await network.provider.send("hardhat_setBalance", [WALLET, "0x56BC75E2D63100000"]);
  const owner = await ethers.getSigner(WALLET);
  const deadline = BigInt((await time.latest()) + 1200);
  const exitLegs = [];
  let aggCb = 0n, aggWeth = 0n, aggUsdc = 0n;

  for (const p of POSITIONS) {
    const npm = await ethers.getContractAt(p.protocol === "uni" ? NPM_UNI : NPM_AERO, p.npm);
    await (await npm.connect(owner).approve(p.adapter, p.tokenId)).wait();
    const pos = await npm.positions(p.tokenId);
    const liq = pos[7];
    const decData = npm.interface.encodeFunctionData("decreaseLiquidity", [{
      tokenId: p.tokenId, liquidity: liq, amount0Min: 0n, amount1Min: 0n, deadline,
    }]);
    const colData = npm.interface.encodeFunctionData("collect", [{
      tokenId: p.tokenId, recipient: WALLET, amount0Max: MAX_UINT128, amount1Max: MAX_UINT128,
    }]);
    const results = await npm.connect(owner).multicall.staticCall([decData, colData]);
    const dec = npm.interface.decodeFunctionResult("decreaseLiquidity", results[0]);
    const col = npm.interface.decodeFunctionResult("collect", results[1]);
    const decM = mapAB(p.tokenA, p.tokenB, pos[2], pos[3], dec[0], dec[1]);
    const colM = mapAB(p.tokenA, p.tokenB, pos[2], pos[3], col[0], col[1]);
    const minA = (decM.amountA * 9500n) / 10000n;
    const minB = (decM.amountB * 9500n) / 10000n;
    if (minA === 0n && minB === 0n) throw new Error("both mins 0 leg " + p.leg);
    console.log(JSON.stringify({
      leg: p.leg, liq: liq.toString(),
      decA: decM.amountA.toString(), decB: decM.amountB.toString(),
      colA: colM.amountA.toString(), colB: colM.amountB.toString(),
      minA: minA.toString(), minB: minB.toString(),
    }));
    exitLegs.push({
      legIndex: p.leg, adapter: p.adapter, tokenA: p.tokenA, tokenB: p.tokenB,
      positionTokenId: p.tokenId, liquidity: 0n, amountAMin: minA, amountBMin: minB,
      slippageBps: 500n, fullExit: true,
    });
    const add = (token, amt) => {
      const t = token.toLowerCase();
      if (t === USDC.toLowerCase()) aggUsdc += amt;
      else if (t === CBBTC.toLowerCase()) aggCb += amt;
      else if (t === WETH.toLowerCase()) aggWeth += amt;
    };
    add(p.tokenA, colM.amountA);
    add(p.tokenB, colM.amountB);
  }

  const oracle = await ethers.getContractAt(["function expectedAmountOut(address,address,uint256,uint8,uint8) view returns (uint256)"], ORACLE);
  const swaps = Array.from({ length: 8 }, () => ({ routeId: ethers.ZeroHash, amountIn: 0n, minOut: 0n, quotedOut: 0n, deadline: 0n }));
  let swapCount = 0;
  const push = async (token, amt, route, dec) => {
    if (amt <= 0n) return;
    // try exact and also +1 wei for rounding
    const amountIn = amt;
    const q = await oracle.expectedAmountOut(token, USDC, amountIn, dec, 6);
    const min = (q * 9900n) / 10000n;
    swaps[swapCount++] = { routeId: route, amountIn, minOut: min, quotedOut: q, deadline };
  };
  await push(CBBTC, aggCb, ethers.id("ROUTE_CBBTC_USDC_UNI_005"), 8);
  await push(WETH, aggWeth, ethers.id("ROUTE_WETH_USDC_UNI_005"), 18);
  console.log({ aggUsdc: aggUsdc.toString(), aggCb: aggCb.toString(), aggWeth: aggWeth.toString(), swapCount });

  const strategy = await ethers.getContractAt([
    "function strategyIdFor(address,uint256,address) view returns (bytes32)",
    "function getLeg(bytes32,uint256) view returns (bytes32,uint256,address,address,address,bytes32,uint256,uint256)",
  ], STRATEGY_REGISTRY);
  const strategyId = await strategy.strategyIdFor(WALLET, 8453, USDC);
  const permissionIds = [];
  for (let i = 0; i < 5; i++) permissionIds.push((await strategy.getLeg(strategyId, i))[5]);
  const perm = await ethers.getContractAt(["function executionNonceUsed(bytes32,uint256) view returns (bool)"], PERMISSION_REGISTRY);
  const EXIT_NONCE_DOMAIN = 1n << 255n;
  let nonceBase = 1n;
  for (; nonceBase < 500n; nonceBase++) {
    let ok = true;
    for (let i = 0; i < 5; i++) {
      if (await perm.executionNonceUsed(permissionIds[i], EXIT_NONCE_DOMAIN | (nonceBase + BigInt(i)))) { ok = false; break; }
    }
    if (ok) break;
  }

  const executor = await ethers.getContractAt(EXECUTOR_ABI, LEGACY_CL_EXECUTOR);
  const usdc = await ethers.getContractAt(["function balanceOf(address) view returns (uint256)"], USDC);
  try {
    const data = executor.interface.encodeFunctionData("exitAllToUsdc", [strategyId, exitLegs, swaps, swapCount, 1n, nonceBase]);
  require("fs").writeFileSync("scripts/stable-club/_calldata-diag.txt", data);
  console.log("ENCODED_EXIT_CALLDATA diag", data.slice(0, 74), "len", data.length);
  const usdcBefore = await usdc.balanceOf(WALLET);
  const tx = await executor.connect(owner).exitAllToUsdc(strategyId, exitLegs, swaps, swapCount, 1n, nonceBase);
    const rc = await tx.wait();
    const usdcAfter = await usdc.balanceOf(WALLET);
    const usdcReceived = usdcAfter - usdcBefore;
    console.log("SUCCESS", rc.hash);
    console.log("USDC_RECEIVED", usdcReceived.toString(), (Number(usdcReceived) / 1e6).toFixed(6));
  } catch (e) {
    console.log("FAIL", e.reason || e.shortMessage || e.message);
    console.log("data", e.data || null);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
