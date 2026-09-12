/**
 * Fork: close stuck Aero token 5976581 with wallet-like gas (estimate×1.007).
 * FORK_CHAIN_ID=8453 npx hardhat run scripts/stable-club/fork-close-stuck-aero-5976581.cjs --network hardhat
 */
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();
const { ethers, network } = require("hardhat");

const WALLET = "0xab4e242C5b489e8301408C93003903364214559F";
const NPM = "0xe1f8cd9AC4e4A65F54f38a5CdAfCA44f6dD68b53";
const TOKEN_ID = 5976581n;
const MAX_UINT128 = (1n << 128n) - 1n;

const NPM_ABI = [
  "function positions(uint256) view returns (uint96,address,address,address,int24,int24,int24,uint128,uint256,uint256,uint128,uint128)",
  "function decreaseLiquidity((uint256 tokenId,uint128 liquidity,uint256 amount0Min,uint256 amount1Min,uint256 deadline)) returns (uint256,uint256)",
  "function collect((uint256 tokenId,address recipient,uint128 amount0Max,uint128 amount1Max)) returns (uint256,uint256)",
  "function burn(uint256)",
  "function multicall(bytes[]) payable returns (bytes[])",
  "function ownerOf(uint256) view returns (address)",
];

async function main() {
  if (!process.env.BASE_RPC_URL) throw new Error("BASE_RPC_URL required");
  await network.provider.request({
    method: "hardhat_reset",
    params: [{ forking: { jsonRpcUrl: process.env.BASE_RPC_URL, chainId: 8453 } }],
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
  const npm = await ethers.getContractAt(NPM_ABI, NPM, owner);
  const pos = await npm.positions(TOKEN_ID);
  const liq = pos[7];
  if (liq === 0n) throw new Error("token already closed");

  const iface = npm.interface;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
  const calls = [
    iface.encodeFunctionData("decreaseLiquidity", [
      {
        tokenId: TOKEN_ID,
        liquidity: liq,
        amount0Min: 0n,
        amount1Min: 0n,
        deadline,
      },
    ]),
    iface.encodeFunctionData("collect", [
      {
        tokenId: TOKEN_ID,
        recipient: WALLET,
        amount0Max: MAX_UINT128,
        amount1Max: MAX_UINT128,
      },
    ]),
    iface.encodeFunctionData("burn", [TOKEN_ID]),
  ];
  const data = iface.encodeFunctionData("multicall", [calls]);
  const est = await owner.estimateGas({ to: NPM, data });
  const walletLike = (est * 1007n) / 1000n;
  console.log(
    JSON.stringify(
      {
        liq: liq.toString(),
        estimate: est.toString(),
        walletLikeGas: walletLike.toString(),
      },
      null,
      2,
    ),
  );

  const tx = await owner.sendTransaction({
    to: NPM,
    data,
    gasLimit: walletLike,
  });
  const receipt = await tx.wait();
  if (receipt.status !== 1) throw new Error("close failed");

  let closed = false;
  try {
    await npm.ownerOf(TOKEN_ID);
  } catch {
    closed = true;
  }
  if (!closed) {
    const after = await npm.positions(TOKEN_ID);
    if (after[7] !== 0n) throw new Error("liquidity remains");
    closed = true;
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        gasUsed: receipt.gasUsed.toString(),
        gasLimit: walletLike.toString(),
        closed,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
