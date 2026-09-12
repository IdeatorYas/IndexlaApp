/**
 * Fork-prove: at block before live failed withdraw (nonce 178), run gateway
 * exitPercentToUsdc for all 5 catalogue LPs → USDC only.
 *
 * FORK_CHAIN_ID=8453 npx hardhat run scripts/stable-club/fork-prove-gateway-atomic-withdraw.cjs --network hardhat
 */
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();
const { ethers, network } = require("hardhat");

const WALLET = "0xab4e242C5b489e8301408C93003903364214559F";
const GATEWAY = "0xE82d1602c2953D805ea8Ebe3056804e4f60d4316";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const CBBTC = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
const WETH = "0x4200000000000000000000000000000000000006";
const ORACLE = "0x0cD087927F590B28737dFd9c7AAeB73B8ede70Ba";
// Block just before first LP exit of the failed run (nonce 178 @ 51211055).
const FORK_BLOCK = 51211054;

const NPMS = [
  "0x827922686190790b37229fd06084350e74485b72",
  "0xe1f8cd9AC4e4A65F54f38a5CdAfCA44f6dD68b53",
  "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1",
];

const ERC20 = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];
const ERC721 = [
  "function balanceOf(address) view returns (uint256)",
  "function tokenOfOwnerByIndex(address,uint256) view returns (uint256)",
  "function setApprovalForAll(address,bool)",
  "function isApprovedForAll(address,address) view returns (bool)",
];
const GATEWAY_ABI = [
  "function exitPercentToUsdc((address npm,uint256 tokenId,uint128 liquidity,uint256 amount0Min,uint256 amount1Min,bool burnIfEmpty)[] exitLegs,(address tokenIn,uint24 fee,uint256 amountIn,uint256 amountOutMinimum)[] swaps,uint256 minUsdcOut,uint256 deadline)",
  "function paused() view returns (bool)",
];
const AERO_POS = [
  "function positions(uint256) view returns (uint96,address,address,address,int24,int24,int24,uint128,uint256,uint256,uint128,uint128)",
  "function decreaseLiquidity((uint256,uint128,uint256,uint256,uint256)) returns (uint256,uint256)",
];
const UNI_POS = [
  "function positions(uint256) view returns (uint96,address,address,address,uint24,int24,int24,uint128,uint256,uint256,uint128,uint128)",
  "function decreaseLiquidity((uint256,uint128,uint256,uint256,uint256)) returns (uint256,uint256)",
];

async function main() {
  if (!process.env.BASE_RPC_URL) throw new Error("BASE_RPC_URL required");
  await network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: process.env.BASE_RPC_URL,
          blockNumber: FORK_BLOCK,
          chainId: 8453,
        },
      },
    ],
  });
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [WALLET],
  });
  await network.provider.send("hardhat_setBalance", [
    WALLET,
    "0x56BC75E2D63100000",
  ]);

  const owner = await ethers.getSigner(WALLET);
  const gateway = await ethers.getContractAt(GATEWAY_ABI, GATEWAY, owner);
  if (await gateway.paused()) throw new Error("gateway paused");

  const usdc = await ethers.getContractAt(ERC20, USDC);
  const cbbtc = await ethers.getContractAt(ERC20, CBBTC);
  const weth = await ethers.getContractAt(ERC20, WETH);
  const usdcBefore = await usdc.balanceOf(WALLET);
  const cbBefore = await cbbtc.balanceOf(WALLET);
  const wethBefore = await weth.balanceOf(WALLET);

  const legs = [];
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
  for (const npmAddr of NPMS) {
    const isUni = npmAddr.toLowerCase().startsWith("0x03a5");
    const npm = await ethers.getContractAt(
      [...ERC721, ...(isUni ? UNI_POS : AERO_POS)],
      npmAddr,
      owner,
    );
    const bal = await npm.balanceOf(WALLET);
    for (let i = 0n; i < bal; i++) {
      const tokenId = await npm.tokenOfOwnerByIndex(WALLET, i);
      const pos = await npm.positions(tokenId);
      const liq = pos[7];
      if (liq === 0n) continue;
      // Simulate decrease for mins=0 (full exit)
      legs.push({
        npm: npmAddr,
        tokenId,
        liquidity: liq,
        amount0Min: 0n,
        amount1Min: 0n,
        burnIfEmpty: true,
      });
    }
    if (!(await npm.isApprovedForAll(WALLET, GATEWAY))) {
      await (await npm.setApprovalForAll(GATEWAY, true)).wait();
    }
  }
  if (legs.length !== 5) {
    throw new Error(`expected 5 open LPs at fork block, got ${legs.length}`);
  }

  const swaps = [
    { tokenIn: CBBTC, fee: 500, amountIn: 0n, amountOutMinimum: 1n },
    { tokenIn: WETH, fee: 500, amountIn: 0n, amountOutMinimum: 1n },
  ];

  const tx = await gateway.exitPercentToUsdc(legs, swaps, 1n, deadline, {
    gasLimit: 3_500_000n,
  });
  const receipt = await tx.wait();
  if (receipt.status !== 1) throw new Error("gateway exit failed");

  const usdcAfter = await usdc.balanceOf(WALLET);
  const cbAfter = await cbbtc.balanceOf(WALLET);
  const wethAfter = await weth.balanceOf(WALLET);
  const ownedLeft = [];
  for (const npmAddr of NPMS) {
    const npm = await ethers.getContractAt(ERC721, npmAddr);
    const bal = await npm.balanceOf(WALLET);
    if (bal > 0n) ownedLeft.push({ npm: npmAddr, bal: bal.toString() });
  }

  const report = {
    forkBlock: FORK_BLOCK,
    legs: legs.length,
    gasUsed: receipt.gasUsed.toString(),
    usdcDelta: (usdcAfter - usdcBefore).toString(),
    usdcDeltaHuman: Number(usdcAfter - usdcBefore) / 1e6,
    cbDelta: (cbAfter - cbBefore).toString(),
    wethDelta: (wethAfter - wethBefore).toString(),
    ownedLeft,
    pass:
      ownedLeft.length === 0 &&
      usdcAfter > usdcBefore &&
      cbAfter <= cbBefore + 20n &&
      wethAfter <= wethBefore + 5_000_000_000n,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) {
    process.exitCode = 1;
    throw new Error("fork gateway atomic withdraw FAILED");
  }
  console.log("PASS fork gateway atomic withdraw (not live confirmation)");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
