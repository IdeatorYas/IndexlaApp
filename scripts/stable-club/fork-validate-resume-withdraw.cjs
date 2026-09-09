/**
 * Fork-validate: full 5-pool USDC withdraw + resume after partial failure.
 * FORK_CHAIN_ID=8453 npx hardhat run scripts/stable-club/fork-validate-resume-withdraw.cjs --network hardhat
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
  "function burn(uint256)",
  "function ownerOf(uint256) view returns (address)",
  "function balanceOf(address) view returns (uint256)",
];
const NPM_AERO = [
  "function positions(uint256) view returns (uint96,address,address,address,int24,int24,int24,uint128,uint256,uint256,uint128,uint128)",
  "function decreaseLiquidity((uint256 tokenId,uint128 liquidity,uint256 amount0Min,uint256 amount1Min,uint256 deadline)) returns (uint256 amount0,uint256 amount1)",
  "function collect((uint256 tokenId,address recipient,uint128 amount0Max,uint128 amount1Max)) returns (uint256 amount0,uint256 amount1)",
  "function multicall(bytes[]) payable returns (bytes[])",
  "function burn(uint256)",
  "function ownerOf(uint256) view returns (address)",
  "function balanceOf(address) view returns (uint256)",
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

async function resetFork(blockNumber) {
  if (!process.env.BASE_RPC_URL) throw new Error("BASE_RPC_URL required");
  const params = {
    jsonRpcUrl: process.env.BASE_RPC_URL,
    chainId: 8453,
  };
  if (blockNumber != null) params.blockNumber = Number(blockNumber);
  await network.provider.request({
    method: "hardhat_reset",
    params: [{ forking: params }],
  });
  await network.provider.send("evm_mine", []);
  await network.provider.request({ method: "hardhat_impersonateAccount", params: [WALLET] });
  await network.provider.send("hardhat_setBalance", [WALLET, "0x56BC75E2D63100000"]);
}

function npmAbi(protocol) {
  return protocol === "uni" ? NPM_UNI : NPM_AERO;
}

function groupByNpm(positions) {
  const byNpm = new Map();
  for (const p of positions) {
    const key = p.npm.toLowerCase();
    if (!byNpm.has(key)) byNpm.set(key, []);
    byNpm.get(key).push(p);
  }
  return byNpm;
}

async function exitNpmGroups(owner, groups, deadline) {
  const done = [];
  for (const [, group] of groups) {
    const npm = await ethers.getContractAt(npmAbi(group[0].protocol), group[0].npm);
    const inner = [];
    for (const p of group) {
      try {
        await npm.ownerOf(p.tokenId);
      } catch {
        continue; // already burned
      }
      const pos = await npm.positions(p.tokenId);
      const liqOut = pos[7];
      if (liqOut <= 0n) continue;
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
      inner.push(npm.interface.encodeFunctionData("burn", [p.tokenId]));
    }
    if (inner.length === 0) continue;
    const tx = await npm.connect(owner).multicall(inner);
    await tx.wait();
    done.push(group[0].npm.toLowerCase());
  }
  return done;
}

async function recoverResidue(owner, baseline) {
  const oracle = await ethers.getContractAt(ORACLE_ABI, ORACLE);
  const router = await ethers.getContractAt(ROUTER, UNI_ROUTER);
  const swaps = [];
  for (const [token, symbol, dec, baseKey] of [
    [CBBTC, "cbBTC", 8, "cbBtc"],
    [WETH, "WETH", 18, "weth"],
  ]) {
    const erc = await ethers.getContractAt(ERC20, token);
    const bal = await erc.balanceOf(WALLET);
    const base = baseline[baseKey];
    const residue = bal > base ? bal - base : 0n;
    if (residue <= 0n) continue;
    const quoted = await oracle.expectedAmountOut(token, USDC, residue, dec, 6);
    const minOut = (quoted * (10000n - UNWIND_SLIPPAGE_BPS)) / 10000n;
    const allowance = await erc.allowance(WALLET, UNI_ROUTER);
    if (allowance < residue) {
      await (await erc.connect(owner).approve(UNI_ROUTER, residue)).wait();
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
    await swap.wait();
    swaps.push({ symbol, residue: residue.toString() });
  }
  return swaps;
}

async function assertNoResidue(baseline) {
  for (const [token, baseKey] of [
    [CBBTC, "cbBtc"],
    [WETH, "weth"],
  ]) {
    const erc = await ethers.getContractAt(ERC20, token);
    const bal = await erc.balanceOf(WALLET);
    const residue = bal > baseline[baseKey] ? bal - baseline[baseKey] : 0n;
    if (residue > 0n) throw new Error(`residue left on ${baseKey}: ${residue}`);
  }
}

async function countOwned() {
  let n = 0;
  for (const p of POSITIONS) {
    const npm = await ethers.getContractAt(npmAbi(p.protocol), p.npm);
    try {
      const o = await npm.ownerOf(p.tokenId);
      if (o.toLowerCase() === WALLET.toLowerCase()) n += 1;
    } catch {
      // burned
    }
  }
  return n;
}

async function main() {
  // Pin just before the live owner-NPM withdraw sequence (first multicall ~51085973).
  const FORK_BLOCK = 51085970n;
  await resetFork(FORK_BLOCK);
  const ownedAtStart = await countOwned();
  if (ownedAtStart < 5) {
    throw new Error(
      `Expected 5 owned NFTs at block ${FORK_BLOCK}, got ${ownedAtStart}`,
    );
  }

  const owner = await ethers.getSigner(WALLET);
  const usdc = await ethers.getContractAt(ERC20, USDC);
  const cbbtc = await ethers.getContractAt(ERC20, CBBTC);
  const weth = await ethers.getContractAt(ERC20, WETH);
  const baseline = {
    usdc: await usdc.balanceOf(WALLET),
    cbBtc: await cbbtc.balanceOf(WALLET),
    weth: await weth.balanceOf(WALLET),
  };
  const deadline = BigInt((await time.latest()) + 1200);
  const byNpm = groupByNpm(POSITIONS);
  const npmKeys = [...byNpm.keys()];

  // --- Partial failure: exit first NPM group only, leave others + no recover ---
  const firstKey = npmKeys[0];
  const firstGroup = new Map([[firstKey, byNpm.get(firstKey)]]);
  await exitNpmGroups(owner, firstGroup, deadline);
  const afterPartialOwned = await countOwned();
  if (afterPartialOwned >= ownedAtStart) {
    throw new Error("partial exit did not reduce owned NFTs");
  }
  const midCb = await cbbtc.balanceOf(WALLET);
  const midWeth = await weth.balanceOf(WALLET);
  const hasResidue =
    midCb > baseline.cbBtc || midWeth > baseline.weth;
  if (!hasResidue) {
    throw new Error("expected pool-token residue after partial NPM exit");
  }

  // Resume: remaining NPM groups + residue→USDC only
  const remaining = new Map(
    [...byNpm.entries()].filter(([k]) => k !== firstKey),
  );
  await exitNpmGroups(owner, remaining, deadline);
  const swaps = await recoverResidue(owner, baseline);
  await assertNoResidue(baseline);
  const ownedEnd = await countOwned();
  if (ownedEnd !== 0) throw new Error(`still own ${ownedEnd} NFTs`);
  const usdcAfter = await usdc.balanceOf(WALLET);
  if (usdcAfter <= baseline.usdc) throw new Error("USDC did not increase");

  // Full path on fresh fork at same pre-withdraw block
  await resetFork(FORK_BLOCK);
  const owner2 = await ethers.getSigner(WALLET);
  const baseline2 = {
    usdc: await (await ethers.getContractAt(ERC20, USDC)).balanceOf(WALLET),
    cbBtc: await (await ethers.getContractAt(ERC20, CBBTC)).balanceOf(WALLET),
    weth: await (await ethers.getContractAt(ERC20, WETH)).balanceOf(WALLET),
  };
  const deadline2 = BigInt((await time.latest()) + 1200);
  await exitNpmGroups(owner2, groupByNpm(POSITIONS), deadline2);
  await recoverResidue(owner2, baseline2);
  await assertNoResidue(baseline2);
  const usdcFull = await (await ethers.getContractAt(ERC20, USDC)).balanceOf(WALLET);
  if (usdcFull <= baseline2.usdc) throw new Error("full path USDC did not increase");

  console.log(
    JSON.stringify(
      {
        ok: true,
        forkBlock: FORK_BLOCK.toString(),
        partialResume: {
          ownedAtStart,
          afterPartialOwned,
          ownedEnd,
          swaps,
          usdcReceived: (usdcAfter - baseline.usdc).toString(),
          usdcReceivedFormatted: (Number(usdcAfter - baseline.usdc) / 1e6).toFixed(6),
        },
        fullFivePool: {
          usdcReceived: (usdcFull - baseline2.usdc).toString(),
          usdcReceivedFormatted: (Number(usdcFull - baseline2.usdc) / 1e6).toFixed(6),
        },
      },
      null,
      2,
    ),
  );
  console.log("SUCCESS resume-withdraw-fork");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
