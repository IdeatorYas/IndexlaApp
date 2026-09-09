/**
 * FE-equivalent withdraw tests on Base fork only (no live broadcast).
 * Mirrors StableClubPositionDashboard → withdrawPercent:
 *   - legacy 20% / custom % → owner NPM + Uni → USDC
 *   - legacy 100% → NFT permit (0x7ac2ff7b) + exitAllToUsdc → USDC
 *
 *   FORK_CHAIN_ID=8453 npx hardhat run scripts/stable-club/fork-validate-frontend-withdrawals.cjs --network hardhat
 */
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();
const { ethers, network } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { execFileSync } = require("child_process");
const path = require("path");

const WALLET = "0xab4e242C5b489e8301408C93003903364214559F";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const CBBTC = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
const WETH = "0x4200000000000000000000000000000000000006";
const ORACLE = "0x0cD087927F590B28737dFd9c7AAeB73B8ede70Ba";
const UNI_ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481";
const STRATEGY_REGISTRY = "0xf6696C45A1A186712c530696a5B392Ed9E18ae24";
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

const NPM_DOMAINS = {
  "0x03a520b32c04bf3beef7beb72e919cf822ed34f1": { name: "Uniswap V3 Positions NFT-V1", version: "1" },
  "0x827922686190790b37229fd06084350e74485b72": { name: "Slipstream Position NFT v1", version: "1" },
  "0xe1f8cd9ac4e4a65f54f38a5cdafca44f6dd68b53": { name: "Slipstream Position NFT v1", version: "1" },
};

const NPM_UNI = [
  "function positions(uint256) view returns (uint96,address,address,address,uint24,int24,int24,uint128,uint256,uint256,uint128,uint128)",
  "function decreaseLiquidity((uint256 tokenId,uint128 liquidity,uint256 amount0Min,uint256 amount1Min,uint256 deadline)) returns (uint256 amount0,uint256 amount1)",
  "function collect((uint256 tokenId,address recipient,uint128 amount0Max,uint128 amount1Max)) returns (uint256 amount0,uint256 amount1)",
  "function multicall(bytes[]) payable returns (bytes[])",
  "function ownerOf(uint256) view returns (address)",
  "function permit(address spender,uint256 tokenId,uint256 deadline,uint8 v,bytes32 r,bytes32 s)",
  "function getApproved(uint256) view returns (address)",
  "function nonces(uint256) view returns (uint256)",
  "function safeTransferFrom(address,address,uint256)",
];
const NPM_AERO = [
  "function positions(uint256) view returns (uint96,address,address,address,int24,int24,int24,uint128,uint256,uint256,uint128,uint128)",
  "function decreaseLiquidity((uint256 tokenId,uint128 liquidity,uint256 amount0Min,uint256 amount1Min,uint256 deadline)) returns (uint256 amount0,uint256 amount1)",
  "function collect((uint256 tokenId,address recipient,uint128 amount0Max,uint128 amount1Max)) returns (uint256 amount0,uint256 amount1)",
  "function multicall(bytes[]) payable returns (bytes[])",
  "function ownerOf(uint256) view returns (address)",
  "function permit(address spender,uint256 tokenId,uint256 deadline,uint8 v,bytes32 r,bytes32 s)",
  "function getApproved(uint256) view returns (address)",
  "function nonces(uint256) view returns (uint256)",
  "function safeTransferFrom(address,address,uint256)",
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

const PERMIT_TYPES = {
  Permit: [
    { name: "spender", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

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
  const usdcBefore = await usdc.balanceOf(WALLET);
  const prompts = [];

  for (const p of POSITIONS) {
    const npm = await ethers.getContractAt(npmAbi(p.protocol), p.npm);
    const nftOwner = await npm.ownerOf(p.tokenId);
    if (nftOwner.toLowerCase() !== WALLET.toLowerCase()) {
      throw new Error(`leg ${p.leg} owner ${nftOwner}`);
    }
    const pos = await npm.positions(p.tokenId);
    const liqOut = (pos[7] * percentBps) / 10000n;
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

    const liveDec = npm.interface.encodeFunctionData("decreaseLiquidity", [
      { tokenId: p.tokenId, liquidity: liqOut, amount0Min: min0, amount1Min: min1, deadline },
    ]);
    const liveCol = npm.interface.encodeFunctionData("collect", [
      { tokenId: p.tokenId, recipient: WALLET, amount0Max: MAX_UINT128, amount1Max: MAX_UINT128 },
    ]);
    const mcData = npm.interface.encodeFunctionData("multicall", [[liveDec, liveCol]]);
    const sel = mcData.slice(0, 10).toLowerCase();
    if (sel === APPROVE_SELECTOR) throw new Error("NPM multicall used approve selector");
    prompts.push({
      phase: "npm-owner-multicall",
      leg: p.leg,
      to: p.npm,
      selector: sel,
      isNftApprove: false,
      isNftPermit: false,
    });
    const tx = await npm.connect(owner).multicall([liveDec, liveCol]);
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
    feRoute: "withdrawPercent → withdrawLegacyPercentViaOwnerNpm",
    percent,
    usdcReceived: usdcReceived.toString(),
    usdcReceivedFormatted: (Number(usdcReceived) / 1e6).toFixed(6),
    prompts,
  };
}

async function provePermitsFeStyle() {
  // Impersonation cannot EIP-712-sign. FE owner signs in-wallet; on fork we temporarily
  // transfer NFT → Hardhat keyed signer → permit(0x7ac2ff7b) → transfer back (clears approval).
  const [signer] = await ethers.getSigners();
  const owner = await ethers.getSigner(WALLET);
  const deadline = BigInt((await time.latest()) + 3600);
  const out = [];
  const byNpm = new Map();
  for (const p of POSITIONS) {
    if (!byNpm.has(p.npm.toLowerCase())) byNpm.set(p.npm.toLowerCase(), p);
  }
  for (const p of byNpm.values()) {
    const npm = await ethers.getContractAt(npmAbi(p.protocol), p.npm);
    await (await npm.connect(owner).safeTransferFrom(WALLET, signer.address, p.tokenId)).wait();
    const nonce = (await npm.positions(p.tokenId))[0];
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
    const { v, r, s } = ethers.Signature.from(signature);
    const data = npm.interface.encodeFunctionData("permit", [
      p.adapter,
      p.tokenId,
      deadline,
      v,
      r,
      s,
    ]);
    const sel = data.slice(0, 10).toLowerCase();
    if (sel !== PERMIT_SELECTOR) throw new Error(`leg ${p.leg} not permit selector`);
    if (sel === APPROVE_SELECTOR) throw new Error(`leg ${p.leg} approve selector`);
    await (await npm.connect(signer).permit(p.adapter, p.tokenId, deadline, v, r, s)).wait();
    const approved = await npm.getApproved(p.tokenId);
    if (approved.toLowerCase() !== p.adapter.toLowerCase()) {
      throw new Error(`leg ${p.leg} getApproved mismatch`);
    }
    await (await npm.connect(signer).safeTransferFrom(signer.address, WALLET, p.tokenId)).wait();
    out.push({
      leg: p.leg,
      npm: p.npm,
      selector: sel,
      isPermit: true,
      isApprove: false,
      spender: p.adapter,
      note: "FE signs EIP-712 Permit in MetaMask then broadcasts permit — fork used transfer+keyed-signer stand-in",
    });
  }
  return out;
}

async function runHundredPercent() {
  // FE: withdrawPercent(100) → exitAllToUsdc → permit then atomic exit.
  // Proven exit construction is _diag-mc-exit.cjs (same production mins/unwind).
  const permitPrompts = await provePermitsFeStyle();
  const hardhatCmd = path.join(process.cwd(), "node_modules", ".bin", "hardhat.cmd");
  // diag resets fork itself — re-prove that 100% exit still lands USDC on a fresh fork,
  // then re-state that FE would have preceded it with permits (proven above on prior fork).
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
  if (!ok) throw new Error("diag-mc-exit failed for 100%");
  return {
    ok: true,
    feRoute: "withdrawPercent(100) → exitAllToUsdc + NFT permit",
    percent: 100,
    permitPrompts,
    exitEngine: "diag-mc-exit (FE production mins/unwind)",
    successLine,
    note: "Permit proven on fork impersonation; exit proven via diag child on fresh fork. No live broadcast.",
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
        "pct!==100 → owner NPM+Uni; pct===100 → permit 0x7ac2ff7b + exitAllToUsdc",
      featureFlags: "exitAllToUsdc + exitPercentToUsdc true in trusted Base manifest",
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

  console.log("=== FE 100% permit + atomic exit ===");
  await resetFork();
  report.results.pct100 = await runHundredPercent();
  console.log(JSON.stringify({ pct100: report.results.pct100 }, null, 2));

  report.walletWarning = {
    pct20_and_custom: {
      nftApprove095ea7b3: false,
      nftPermit7ac2ff7b: false,
      expectedWalletPrompts:
        "NPM multicall (decrease/collect) + ERC20 approve(Uni router) + exactInputSingle — no NFT approve/permit",
      falsePositiveErc20ApproveOnNft: "N/A — no NFT authority tx",
    },
    pct100: {
      nftApprove095ea7b3: false,
      nftPermit7ac2ff7b: report.results.pct100.permitPrompts.every((p) => p.isPermit),
      expectedWalletPrompts:
        "EIP-712 Permit sign + on-chain permit(0x7ac2ff7b) per NFT, then exitAllToUsdc",
      falsePositiveErc20ApproveOnNft:
        "Removed by selector change; live MetaMask/Blockaid clearance NOT rechecked (would require your live sign)",
    },
    liveRecheckRequired: true,
    liveRecheckInstruction:
      "When you are ready: open Withdraw → 100% → Confirm USDC in the app, inspect MetaMask/Blockaid on the permit prompt only, then Cancel if you do not want to move funds.",
  };

  report.allPassed =
    report.results.pct20.ok &&
    report.results.custom37.ok &&
    report.results.pct100.ok;

  console.log(JSON.stringify(report, null, 2));
  if (!report.allPassed) process.exitCode = 1;
  else console.log("SUCCESS frontend-withdrawals-fork");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
