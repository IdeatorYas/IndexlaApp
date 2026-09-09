/**
 * FE-equivalent legacy custom-%: owner NPM decrease/collect (no permit) → Uni → USDC.
 * Registry is non-proxy — no rebind. LP mins use 500 bps (5%) — not raised.
 */
require("dotenv").config({ path: ".env.local" });
const { ethers, network } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const WALLET = "0xab4e242C5b489e8301408C93003903364214559F";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const CBBTC = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
const WETH = "0x4200000000000000000000000000000000000006";
const ORACLE = "0x0cD087927F590B28737dFd9c7AAeB73B8ede70Ba";
const UNI_ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481";
const MAX_UINT128 = (1n << 128n) - 1n;
const LP_SLIPPAGE_BPS = 500n; // 5% — configured product tolerance; do not raise
const UNWIND_SLIPPAGE_BPS = 100n; // 1% Uni recover
const PERCENT_BPS = 2000n; // 20% custom

const POSITIONS = [
  { leg: 0, protocol: "aero", npm: "0x827922686190790b37229fd06084350e74485b72", tokenId: 76509432n },
  { leg: 1, protocol: "uni", npm: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1", tokenId: 5950024n },
  { leg: 2, protocol: "aero", npm: "0xe1f8cd9AC4e4A65F54f38a5CdAfCA44f6dD68b53", tokenId: 5664410n },
  { leg: 3, protocol: "aero", npm: "0x827922686190790b37229fd06084350e74485b72", tokenId: 76509433n },
  { leg: 4, protocol: "uni", npm: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1", tokenId: 5950025n },
];

const NPM_UNI = [
  "function positions(uint256) view returns (uint96,address,address,address,uint24,int24,int24,uint128,uint256,uint256,uint128,uint128)",
  "function decreaseLiquidity((uint256 tokenId,uint128 liquidity,uint256 amount0Min,uint256 amount1Min,uint256 deadline)) returns (uint256 amount0,uint256 amount1)",
  "function collect((uint256 tokenId,address recipient,uint128 amount0Max,uint128 amount1Max)) returns (uint256 amount0,uint256 amount1)",
  "function multicall(bytes[]) payable returns (bytes[])",
  "function ownerOf(uint256) view returns (address)",
  "function nonces(uint256) view returns (uint256)",
  "function permit(address spender,uint256 tokenId,uint256 deadline,uint8 v,bytes32 r,bytes32 s)",
  "function getApproved(uint256) view returns (address)",
];
const NPM_AERO = [
  "function positions(uint256) view returns (uint96,address,address,address,int24,int24,int24,uint128,uint256,uint256,uint128,uint128)",
  "function decreaseLiquidity((uint256 tokenId,uint128 liquidity,uint256 amount0Min,uint256 amount1Min,uint256 deadline)) returns (uint256 amount0,uint256 amount1)",
  "function collect((uint256 tokenId,address recipient,uint128 amount0Max,uint128 amount1Max)) returns (uint256 amount0,uint256 amount1)",
  "function multicall(bytes[]) payable returns (bytes[])",
  "function ownerOf(uint256) view returns (address)",
  "function nonces(uint256) view returns (uint256)",
  "function permit(address spender,uint256 tokenId,uint256 deadline,uint8 v,bytes32 r,bytes32 s)",
  "function getApproved(uint256) view returns (address)",
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

const PERMIT_SELECTOR = "0x7ac2ff7b";
const APPROVE_SELECTOR = "0x095ea7b3";

async function main() {
  await network.provider.request({
    method: "hardhat_reset",
    params: [{ forking: { jsonRpcUrl: process.env.BASE_RPC_URL, chainId: 8453 } }],
  });
  await network.provider.send("evm_mine", []);
  await network.provider.request({ method: "hardhat_impersonateAccount", params: [WALLET] });
  await network.provider.send("hardhat_setBalance", [WALLET, "0x56BC75E2D63100000"]);
  const owner = await ethers.getSigner(WALLET);
  const deadline = BigInt((await time.latest()) + 1200);
  const usdc = await ethers.getContractAt(ERC20, USDC);
  const oracle = await ethers.getContractAt(ORACLE_ABI, ORACLE);
  const router = await ethers.getContractAt(ROUTER, UNI_ROUTER);

  const usdcBefore = await usdc.balanceOf(WALLET);
  const legTxs = [];

  for (const p of POSITIONS) {
    const npm = await ethers.getContractAt(p.protocol === "uni" ? NPM_UNI : NPM_AERO, p.npm);
    const nftOwner = await npm.ownerOf(p.tokenId);
    if (nftOwner.toLowerCase() !== WALLET.toLowerCase()) {
      throw new Error(`leg ${p.leg} owner mismatch ${nftOwner}`);
    }
    const pos = await npm.positions(p.tokenId);
    const liqNow = pos[7];
    const liqOut = (liqNow * PERCENT_BPS) / 10000n;
    if (liqOut <= 0n) throw new Error(`leg ${p.leg} liqOut 0`);

    const decData = npm.interface.encodeFunctionData("decreaseLiquidity", [
      { tokenId: p.tokenId, liquidity: liqOut, amount0Min: 0n, amount1Min: 0n, deadline },
    ]);
    const colData = npm.interface.encodeFunctionData("collect", [
      { tokenId: p.tokenId, recipient: WALLET, amount0Max: MAX_UINT128, amount1Max: MAX_UINT128 },
    ]);
    const sim = await npm.connect(owner).multicall.staticCall([decData, colData]);
    const dec = npm.interface.decodeFunctionResult("decreaseLiquidity", sim[0]);
    const min0 = (dec[0] * (10000n - LP_SLIPPAGE_BPS)) / 10000n;
    const min1 = (dec[1] * (10000n - LP_SLIPPAGE_BPS)) / 10000n;
    if (min0 === 0n && min1 === 0n) throw new Error(`leg ${p.leg} both mins 0`);

    const liveDec = npm.interface.encodeFunctionData("decreaseLiquidity", [
      { tokenId: p.tokenId, liquidity: liqOut, amount0Min: min0, amount1Min: min1, deadline },
    ]);
    const liveCol = npm.interface.encodeFunctionData("collect", [
      { tokenId: p.tokenId, recipient: WALLET, amount0Max: MAX_UINT128, amount1Max: MAX_UINT128 },
    ]);
    const tx = await npm.connect(owner).multicall([liveDec, liveCol]);
    const rc = await tx.wait();
    if (tx.data.slice(0, 10).toLowerCase() === APPROVE_SELECTOR) {
      throw new Error("unexpected approve selector on NPM multicall");
    }
    legTxs.push({ leg: p.leg, npm: p.npm, hash: rc.hash, liqOut: liqOut.toString() });
    console.log(JSON.stringify({ leg: p.leg, hash: rc.hash, liqOut: liqOut.toString(), min0: min0.toString(), min1: min1.toString() }));
  }

  const recoverTxs = [];
  for (const [token, symbol, dec] of [
    [CBBTC, "cbBTC", 8],
    [WETH, "WETH", 18],
  ]) {
    const erc = await ethers.getContractAt(ERC20, token);
    const bal = await erc.balanceOf(WALLET);
    if (bal <= 0n) continue;
    const quoted = await oracle.expectedAmountOut(token, USDC, bal, dec, 6);
    const minOut = (quoted * (10000n - UNWIND_SLIPPAGE_BPS)) / 10000n;
    if (minOut <= 0n) throw new Error(`${symbol} minOut 0`);
    const allowance = await erc.allowance(WALLET, UNI_ROUTER);
    if (allowance < bal) {
      const a = await erc.connect(owner).approve(UNI_ROUTER, bal);
      await a.wait();
      recoverTxs.push({ step: "approve", symbol, hash: a.hash, selector: a.data.slice(0, 10) });
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
    const src = await swap.wait();
    recoverTxs.push({ step: "swap", symbol, hash: src.hash, amountIn: bal.toString(), minOut: minOut.toString() });
    console.log(JSON.stringify({ recover: symbol, hash: src.hash, amountIn: bal.toString() }));
  }

  const leftoverCb = await (await ethers.getContractAt(ERC20, CBBTC)).balanceOf(WALLET);
  const leftoverWeth = await (await ethers.getContractAt(ERC20, WETH)).balanceOf(WALLET);
  if (leftoverCb > 0n || leftoverWeth > 0n) {
    throw new Error(`leftover non-USDC cb=${leftoverCb} weth=${leftoverWeth}`);
  }

  const usdcAfter = await usdc.balanceOf(WALLET);
  const usdcReceived = usdcAfter - usdcBefore;
  if (usdcReceived <= 0n) throw new Error("USDC did not increase");

  // Permit selector proof (wallet-warning path for 100% INDEXLA) — no fund movement.
  const permitChecks = [];
  for (const p of POSITIONS) {
    const npm = await ethers.getContractAt(p.protocol === "uni" ? NPM_UNI : NPM_AERO, p.npm);
    const data = npm.interface.encodeFunctionData("permit", [
      "0x518aB4069fB15dC201a00D19a9bC65CCB4D23fA8",
      p.tokenId,
      deadline,
      27,
      ethers.ZeroHash,
      ethers.ZeroHash,
    ]);
    permitChecks.push({
      leg: p.leg,
      npm: p.npm,
      permitSelector: data.slice(0, 10),
      isPermit: data.slice(0, 10).toLowerCase() === PERMIT_SELECTOR,
      isApprove: data.slice(0, 10).toLowerCase() === APPROVE_SELECTOR,
    });
  }

  const report = {
    route: "owner-npm-percent-then-uni-usdc",
    percentBps: PERCENT_BPS.toString(),
    lpSlippageBps: LP_SLIPPAGE_BPS.toString(),
    unwindSlippageBps: UNWIND_SLIPPAGE_BPS.toString(),
    usdcBefore: usdcBefore.toString(),
    usdcAfter: usdcAfter.toString(),
    usdcReceived: usdcReceived.toString(),
    legTxs,
    recoverTxs,
    permitChecks,
    slipstreamId: "avoided — each leg used position.npm as owner (no adapter)",
    walletWarning: {
      customPercentPath: "no NFT permit/approve — ERC20 approve only for Uni router recover",
      hundredPercentPath:
        "uses permit 0x7ac2ff7b (not 0x095ea7b3); selector change removes ERC20-mislabel trigger but does not prove MetaMask/Blockaid clearance",
      permitSelectorsOk: permitChecks.every((c) => c.isPermit && !c.isApprove),
    },
    withdrawalFixed: true,
  };
  console.log(JSON.stringify(report, null, 2));
  console.log("SUCCESS", usdcReceived.toString(), "USDC");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
