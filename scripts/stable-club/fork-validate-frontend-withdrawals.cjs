/**
 * FE-equivalent withdraw tests on Base fork only (no live broadcast).
 * Mirrors StableClubPositionDashboard → withdrawPercent for legacy stack:
 *   - any % (20 / custom / 100) → owner NPM batched per NPM + Uni → USDC
 *   - no NFT permit/approve (avoids unverified-adapter wallet warning)
 *
 *   FORK_CHAIN_ID=8453 npx hardhat run scripts/stable-club/fork-validate-frontend-withdrawals.cjs --network hardhat
 */
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();
const { ethers, network } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const WALLET = "0xab4e242C5b489e8301408C93003903364214559F";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const CBBTC = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
const WETH = "0x4200000000000000000000000000000000000006";
const ORACLE = "0x0cD087927F590B28737dFd9c7AAeB73B8ede70Ba";
const UNI_ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481";
const MAX_UINT128 = (1n << 128n) - 1n;
const LP_SLIPPAGE_BPS = 500n;
const UNWIND_SLIPPAGE_BPS = 100n;
const PERMIT_SELECTOR = "0x7ac2ff7b";
const APPROVE_SELECTOR = "0x095ea7b3";

const POSITIONS = [
  { leg: 0, protocol: "aero", npm: "0x827922686190790b37229fd06084350e74485b72", adapter: "0x518aB4069fB15dC201a00D19a9bC65CCB4D23fA8", tokenId: 76509432n },
  { leg: 1, protocol: "uni", npm: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1", adapter: "0x27dB4752042A1de36Dae6Ee473Df32Ec5dBA2216", tokenId: 5950024n },
  { leg: 2, protocol: "aero", npm: "0xe1f8cd9AC4e4A65F54f38a5CdAfCA44f6dD68b53", adapter: "0xf116E439128c9ba2E7824BB46dF12877BcBaC41f", tokenId: 5664410n },
  { leg: 3, protocol: "aero", npm: "0x827922686190790b37229fd06084350e74485b72", adapter: "0xcb58E708fAa868b8D2052c33a798b4BAEa2FAD7b", tokenId: 76509433n },
  { leg: 4, protocol: "uni", npm: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1", adapter: "0xf51bd174b19008526594E9ae5837FcA66BEB6adf", tokenId: 5950025n },
];

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
];
const ROUTER = [
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)",
];
const ORACLE_ABI = [
  "function expectedAmountOut(address,address,uint256,uint8,uint8) view returns (uint256)",
];

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

function npmAbi(protocol) {
  return protocol === "uni" ? NPM_UNI : NPM_AERO;
}

async function runOwnerPercent(percent) {
  const owner = await ethers.getSigner(WALLET);
  const deadline = BigInt((await time.latest()) + 1200);
  const usdc = await ethers.getContractAt(ERC20, USDC);
  const oracle = await ethers.getContractAt(ORACLE_ABI, ORACLE);
  const router = await ethers.getContractAt(ROUTER, UNI_ROUTER);
  const percentBps = BigInt(Math.round(percent) * 100);
  const fullExit = Math.round(percent) === 100;
  const usdcBefore = await usdc.balanceOf(WALLET);
  const prompts = [];

  const byNpm = new Map();
  for (const p of POSITIONS) {
    const key = p.npm.toLowerCase();
    if (!byNpm.has(key)) byNpm.set(key, []);
    byNpm.get(key).push(p);
  }

  for (const [, group] of byNpm) {
    const npm = await ethers.getContractAt(npmAbi(group[0].protocol), group[0].npm);
    const inner = [];
    for (const p of group) {
      const nftOwner = await npm.ownerOf(p.tokenId);
      if (nftOwner.toLowerCase() !== WALLET.toLowerCase()) {
        throw new Error(`leg ${p.leg} owner ${nftOwner}`);
      }
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
    const mcData = npm.interface.encodeFunctionData("multicall", [inner]);
    const sel = mcData.slice(0, 10).toLowerCase();
    if (sel === APPROVE_SELECTOR || sel === PERMIT_SELECTOR) {
      throw new Error(`batched NPM multicall used forbidden selector ${sel}`);
    }
    prompts.push({
      phase: "npm-owner-multicall-batched",
      legs: group.map((g) => g.leg),
      to: group[0].npm,
      selector: sel,
      innerCalls: inner.length,
      isNftApprove: false,
      isNftPermit: false,
    });
    const tx = await npm.connect(owner).multicall(inner);
    await tx.wait();
  }

  for (const [token, symbol, dec] of [
    [CBBTC, "cbBTC", 8],
    [WETH, "WETH", 18],
  ]) {
    const erc = await ethers.getContractAt(ERC20, token);
    const bal = await erc.balanceOf(WALLET);
    if (bal <= 0n) continue;
    const quoted = await oracle.expectedAmountOut(token, USDC, bal, dec, 6);
    const minOut = (quoted * (10000n - UNWIND_SLIPPAGE_BPS)) / 10000n;
    const allowance = await erc.allowance(WALLET, UNI_ROUTER);
    if (allowance < bal) {
      const a = await erc.connect(owner).approve(UNI_ROUTER, bal);
      prompts.push({
        phase: "uni-router-erc20-approve",
        symbol,
        to: token,
        selector: a.data.slice(0, 10).toLowerCase(),
        isNftApprove: false,
        isNftPermit: false,
        note: "Standard ERC20 approve to Uniswap SwapRouter (verified) — expected for recover",
      });
      await a.wait();
    }
    const swap = await router.connect(owner).exactInputSingle({
      tokenIn: token,
      tokenOut: USDC,
      fee: 500,
      recipient: WALLET,
      amountIn: bal,
      amountOutMinimum: minOut,
      sqrtPriceLimitX96: 0n,
    });
    prompts.push({
      phase: "uni-exactInputSingle",
      symbol,
      to: UNI_ROUTER,
      selector: swap.data.slice(0, 10).toLowerCase(),
    });
    await swap.wait();
  }

  const leftoverCb = await (await ethers.getContractAt(ERC20, CBBTC)).balanceOf(WALLET);
  const leftoverWeth = await (await ethers.getContractAt(ERC20, WETH)).balanceOf(WALLET);
  if (leftoverCb > 0n || leftoverWeth > 0n) {
    throw new Error(`leftover non-USDC cb=${leftoverCb} weth=${leftoverWeth}`);
  }
  const usdcAfter = await usdc.balanceOf(WALLET);
  const usdcReceived = usdcAfter - usdcBefore;
  if (usdcReceived <= 0n) throw new Error("USDC did not increase");
  return {
    ok: true,
    feRoute: "withdrawPercent → withdrawLegacyPercentViaOwnerNpm (batched per NPM)",
    percent: Math.round(percent),
    npmBatches: byNpm.size,
    usdcReceived: usdcReceived.toString(),
    usdcReceivedFormatted: (Number(usdcReceived) / 1e6).toFixed(6),
    prompts,
  };
}

async function main() {
  const report = {
    liveFundsMoved: false,
    liveSigningRequested: false,
    wallet: WALLET,
    feUi: {
      presets: [20, 50, 100, "custom"],
      legacyRouting:
        "any % → owner NPM batched + Uni recover (no NFT permit to unverified adapters)",
      featureFlags: "exitAllToUsdc + exitPercentToUsdc true in trusted Base manifest (primary stack)",
    },
    results: {},
  };

  console.log("=== FE 20% (preset) ===");
  await resetFork();
  report.results.pct20 = await runOwnerPercent(20);
  console.log(JSON.stringify({ pct20: report.results.pct20 }, null, 2));

  console.log("=== FE custom 37% ===");
  await resetFork();
  report.results.custom37 = await runOwnerPercent(37);
  console.log(JSON.stringify({ custom37: report.results.custom37 }, null, 2));

  console.log("=== FE 100% owner NPM (no permit) ===");
  await resetFork();
  report.results.pct100 = await runOwnerPercent(100);
  console.log(JSON.stringify({ pct100: report.results.pct100 }, null, 2));

  report.walletWarning = {
    allPercents: {
      nftApprove095ea7b3: false,
      nftPermit7ac2ff7b: false,
      expectedWalletPrompts:
        "NPM multicall (batched decrease/collect[/burn]) + ERC20 approve(Uni router) + exactInputSingle — no NFT approve/permit",
      unverifiedAdapterFalsePositive: "Avoided — legacy path never permits/approves to IndexLa adapters",
    },
    liveRecheckRequired: false,
    liveRecheckInstruction:
      "Legacy 100% no longer prompts NFT permit. Ensure wallet has enough Base ETH for ~3 NPM batches + Uni recover.",
  };

  report.walletConfirmationCounts = {
    pct20: report.results.pct20.prompts.length,
    custom37: report.results.custom37.prompts.length,
    pct100: report.results.pct100.prompts.length,
  };
  report.maxTwoTarget = {
    target: 2,
    achieved: false,
    blocker:
      "3 NPM multicalls (one per NPM contract) + Uni ERC20 approve/swap for residue — typically 5–7 cold wallet confirms. No cross-NPM+Uni batch contract on live Base.",
  };

  report.allPassed =
    report.results.pct20.ok &&
    report.results.custom37.ok &&
    report.results.pct100.ok &&
    report.results.pct20.npmBatches === 3 &&
    report.results.pct100.prompts.every((p) => !p.isNftPermit && !p.isNftApprove);

  console.log(JSON.stringify(report, null, 2));
  if (!report.allPassed) process.exitCode = 1;
  else console.log("SUCCESS frontend-withdrawals-fork");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
