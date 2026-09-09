/**
 * Fork: resume ONLY unfinished Uni residue→USDC for the live wallet after 50% withdraw STF.
 * Does not decrease/burn more LP. Sells only max(0, bal - baseline) for cbBTC/WETH.
 *
 * Evidence baseline (live):
 *   cbBTC bal=6700 allow(router)=4504 → residue 4504, baseline 2196
 *   WETH allow=0; treat full live WETH as residue only when baselineWeth=0 (pre-withdraw dust none)
 *
 * FORK_CHAIN_ID=8453 npx hardhat run scripts/stable-club/fork-resume-residue-usdc-live.cjs --network hardhat
 */
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

const WALLET = "0xab4e242C5b489e8301408C93003903364214559F";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const CBBTC = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
const WETH = "0x4200000000000000000000000000000000000006";
const ORACLE = "0x0cD087927F590B28737dFd9c7AAeB73B8ede70Ba";
const UNI_ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481";
const UNWIND_SLIPPAGE_BPS = 100n;

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

function residue(current, baseline) {
  return current > baseline ? current - baseline : 0n;
}

async function waitAllowance(token, owner, router, min, label) {
  for (let i = 0; i < 40; i++) {
    const a = await token.allowance(owner, router);
    if (a >= min) return a;
    await network.provider.send("evm_mine", []);
  }
  throw new Error(`${label}: allowance never reached ${min}`);
}

async function recoverOne(signer, tokenAddr, amountIn, symbol, tokenDecimals) {
  if (amountIn <= 0n) return { skipped: true, symbol };
  const token = await ethers.getContractAt(ERC20, tokenAddr, signer);
  const router = await ethers.getContractAt(ROUTER, UNI_ROUTER, signer);
  const oracle = await ethers.getContractAt(ORACLE_ABI, ORACLE);
  const bal = await token.balanceOf(WALLET);
  if (bal < amountIn) throw new Error(`${symbol}: bal ${bal} < amountIn ${amountIn}`);

  let allow = await token.allowance(WALLET, UNI_ROUTER);
  if (allow < amountIn) {
    const tx = await token.approve(UNI_ROUTER, amountIn);
    await tx.wait();
    allow = await waitAllowance(token, WALLET, UNI_ROUTER, amountIn, symbol);
  }
  if (allow < amountIn) throw new Error(`${symbol}: STF precondition allow ${allow} < ${amountIn}`);

  const quoted = await oracle.expectedAmountOut(tokenAddr, USDC, amountIn, tokenDecimals, 6);
  if (quoted <= 0n) throw new Error(`${symbol}: oracle quote 0`);
  const minOut = (quoted * (10000n - UNWIND_SLIPPAGE_BPS)) / 10000n;

  const tx = await router.exactInputSingle([
    tokenAddr,
    USDC,
    500,
    WALLET,
    amountIn,
    minOut,
    0n,
  ]);
  const receipt = await tx.wait();
  return { symbol, amountIn: amountIn.toString(), tx: receipt.hash, quoted: quoted.toString() };
}

async function main() {
  if (!process.env.BASE_RPC_URL) throw new Error("BASE_RPC_URL required");
  await network.provider.request({
    method: "hardhat_reset",
    params: [{ forking: { jsonRpcUrl: process.env.BASE_RPC_URL, chainId: 8453 } }],
  });
  await network.provider.send("evm_mine", []);
  await network.provider.request({ method: "hardhat_impersonateAccount", params: [WALLET] });
  await network.provider.send("hardhat_setBalance", [WALLET, "0x56BC75E2D63100000"]);

  const signer = await ethers.getSigner(WALLET);
  const usdc = await ethers.getContractAt(ERC20, USDC);
  const cbbtc = await ethers.getContractAt(ERC20, CBBTC);
  const weth = await ethers.getContractAt(ERC20, WETH);

  const cbBefore = await cbbtc.balanceOf(WALLET);
  const wethBefore = await weth.balanceOf(WALLET);
  const usdcBefore = await usdc.balanceOf(WALLET);
  const allowBefore = await cbbtc.allowance(WALLET, UNI_ROUTER);

  // Live fingerprint: approve already set to residue 4504 while bal 6700 ⇒ baseline 2196
  const CBBTC_RESIDUE_LIVE = 4504n;
  const baselineCb =
    cbBefore > CBBTC_RESIDUE_LIVE ? cbBefore - CBBTC_RESIDUE_LIVE : 0n;
  const baselineWeth = 0n; // 50% withdraw proceeds dominate; do not sell below baseline

  const cbResidue = residue(cbBefore, baselineCb);
  const wethResidue = residue(wethBefore, baselineWeth);

  const report = {
    wallet: WALLET,
    before: {
      cbBTC: cbBefore.toString(),
      cbAllowRouter: allowBefore.toString(),
      weth: wethBefore.toString(),
      usdc: usdcBefore.toString(),
    },
    baseline: { cbBTC: baselineCb.toString(), weth: baselineWeth.toString() },
    residue: { cbBTC: cbResidue.toString(), weth: wethResidue.toString() },
    swaps: [],
  };

  if (cbResidue > 0n) {
    report.swaps.push(await recoverOne(signer, CBBTC, cbResidue, "cbBTC", 8));
  }
  if (wethResidue > 0n) {
    report.swaps.push(await recoverOne(signer, WETH, wethResidue, "WETH", 18));
  }

  const cbAfter = await cbbtc.balanceOf(WALLET);
  const wethAfter = await weth.balanceOf(WALLET);
  const usdcAfter = await usdc.balanceOf(WALLET);
  const leftCb = residue(cbAfter, baselineCb);
  const leftWeth = residue(wethAfter, baselineWeth);

  report.after = {
    cbBTC: cbAfter.toString(),
    weth: wethAfter.toString(),
    usdc: usdcAfter.toString(),
    usdcDelta: (usdcAfter - usdcBefore).toString(),
    leftoverResidue: { cbBTC: leftCb.toString(), weth: leftWeth.toString() },
  };
  report.pass =
    usdcAfter > usdcBefore && leftCb === 0n && leftWeth === 0n && report.swaps.length > 0;
  report.note =
    "No LP decrease/burn — residue-only Uni SwapRouter02 exactInputSingle. ≤2 wallet confirms still NOT solved (approve+swap per token).";

  const out = path.join(__dirname, "_fork-resume-residue-usdc-live-report.json");
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) {
    process.exitCode = 1;
    throw new Error("fork residue resume FAILED");
  }
  console.log("PASS fork residue→USDC resume");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
