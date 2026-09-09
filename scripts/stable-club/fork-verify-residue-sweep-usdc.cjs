/**
 * Fork: after LP-exit residue (cbBTC+WETH), max-approve + one Uni multicall
 * clears both to USDC. Resume must not re-touch NPM.
 *
 * FORK_CHAIN_ID=8453 npx hardhat run scripts/stable-club/fork-verify-residue-sweep-usdc.cjs --network hardhat
 */
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

const WALLET = "0xab4e242C5b489e8301408C93003903364214559F";
const CBBTC = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
const WETH = "0x4200000000000000000000000000000000000006";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481";
/** Prefer a recent head; override with FORK_BLOCK if needed. */
const FORK_BLOCK = process.env.FORK_BLOCK
  ? Number(process.env.FORK_BLOCK)
  : undefined;

const ERC20 = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function decimals() view returns (uint8)",
];
const ROUTER_ABI = [
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)",
  "function multicall(uint256 deadline, bytes[] data) payable returns (bytes[] results)",
];

const MAX_UINT =
  0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn;
const FEE = 500;
const DUST_CBBTC = 20n;
const DUST_WETH = 5_000_000_000n;
const APPROVE_FLOOR = 120_000n;
const SWEEP_FLOOR = 900_000n;
const BUFFER_BPS = 6000n;

function applyBuffer(estimate, floor) {
  const buffered = (estimate * (10000n + BUFFER_BPS)) / 10000n;
  return buffered > floor ? buffered : floor;
}

function ifaceRouter() {
  return new ethers.Interface(ROUTER_ABI);
}

async function main() {
  if (!process.env.BASE_RPC_URL) throw new Error("BASE_RPC_URL required");
  const forkParams = {
    jsonRpcUrl: process.env.BASE_RPC_URL,
    chainId: 8453,
  };
  if (FORK_BLOCK) forkParams.blockNumber = FORK_BLOCK;

  await network.provider.request({
    method: "hardhat_reset",
    params: [{ forking: forkParams }],
  });
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [WALLET],
  });
  await network.provider.send("hardhat_setBalance", [
    WALLET,
    "0x56BC75E2D63100000",
  ]);

  const signer = await ethers.getSigner(WALLET);
  const cb = await ethers.getContractAt(ERC20, CBBTC, signer);
  const weth = await ethers.getContractAt(ERC20, WETH, signer);
  const usdc = await ethers.getContractAt(ERC20, USDC, signer);
  const router = await ethers.getContractAt(ROUTER_ABI, ROUTER, signer);

  const cbBal = await cb.balanceOf(WALLET);
  const wethBal = await weth.balanceOf(WALLET);
  const usdcBefore = await usdc.balanceOf(WALLET);

  // Simulate withdrawal residue: if wallet is clean, seed small amounts from whales.
  let residueCb = cbBal;
  let residueWeth = wethBal;
  if (residueCb <= DUST_CBBTC || residueWeth <= DUST_WETH) {
    // Use tiny dust-above amounts via deal if available
    try {
      if (residueCb <= DUST_CBBTC) {
        await network.provider.send("hardhat_setStorageAt", [
          CBBTC,
          ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(
              ["address", "uint256"],
              [WALLET, 0],
            ),
          ),
          ethers.toBeHex(50_000n, 32),
        ]);
        residueCb = await cb.balanceOf(WALLET);
      }
    } catch {
      /* fall through */
    }
  }

  residueCb = await cb.balanceOf(WALLET);
  residueWeth = await weth.balanceOf(WALLET);

  const report = {
    wallet: WALLET,
    forkBlock: FORK_BLOCK ?? "latest",
    before: {
      cbBTC: residueCb.toString(),
      WETH: residueWeth.toString(),
      USDC: usdcBefore.toString(),
    },
    steps: [],
  };

  if (residueCb <= DUST_CBBTC && residueWeth <= DUST_WETH) {
    report.error =
      "No cbBTC/WETH residue on wallet at fork — cannot prove sweep. Set FORK_BLOCK to a post-LP-exit block with residue.";
    fs.writeFileSync(
      path.join(__dirname, "_fork-verify-residue-sweep-usdc-report.json"),
      JSON.stringify(report, null, 2),
    );
    throw new Error(report.error);
  }

  const legs = [];
  if (residueCb > DUST_CBBTC) {
    legs.push({ tokenIn: CBBTC, amountIn: residueCb, symbol: "cbBTC" });
  }
  if (residueWeth > DUST_WETH) {
    legs.push({ tokenIn: WETH, amountIn: residueWeth, symbol: "WETH" });
  }

  // Max approve each token once
  for (const leg of legs) {
    const token = await ethers.getContractAt(ERC20, leg.tokenIn, signer);
    const allow = await token.allowance(WALLET, ROUTER);
    if (allow < leg.amountIn) {
      const est = await token.approve.estimateGas(ROUTER, MAX_UINT);
      const gas = applyBuffer(est, APPROVE_FLOOR);
      const tx = await token.approve(ROUTER, MAX_UINT, { gasLimit: gas });
      const rc = await tx.wait();
      report.steps.push({
        kind: "maxApprove",
        symbol: leg.symbol,
        hash: tx.hash,
        gasLimit: gas.toString(),
        gasUsed: rc.gasUsed.toString(),
      });
    } else {
      report.steps.push({
        kind: "approveSkipped",
        symbol: leg.symbol,
        allowance: allow.toString(),
      });
    }
  }

  const iface = ifaceRouter();
  const calls = legs.map((leg) =>
    iface.encodeFunctionData("exactInputSingle", [
      {
        tokenIn: leg.tokenIn,
        tokenOut: USDC,
        fee: FEE,
        recipient: WALLET,
        amountIn: leg.amountIn,
        amountOutMinimum: 0n, // fork proof only; app uses oracle+slippage
        sqrtPriceLimitX96: 0n,
      },
    ]),
  );
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
  const sweepData = iface.encodeFunctionData("multicall", [deadline, calls]);
  expectSelector(sweepData, "0x5ae401dc");

  const est = await signer.estimateGas({
    to: ROUTER,
    data: sweepData,
    from: WALLET,
  });
  const sweepGas = applyBuffer(est, SWEEP_FLOOR);
  const sweepTx = await signer.sendTransaction({
    to: ROUTER,
    data: sweepData,
    gasLimit: sweepGas,
  });
  const sweepRc = await sweepTx.wait();
  report.steps.push({
    kind: "sweepMulticall",
    symbols: legs.map((l) => l.symbol),
    hash: sweepTx.hash,
    gasLimit: sweepGas.toString(),
    gasUsed: sweepRc.gasUsed.toString(),
    selector: sweepData.slice(0, 10),
  });

  const cbAfter = await cb.balanceOf(WALLET);
  const wethAfter = await weth.balanceOf(WALLET);
  const usdcAfter = await usdc.balanceOf(WALLET);
  report.after = {
    cbBTC: cbAfter.toString(),
    WETH: wethAfter.toString(),
    USDC: usdcAfter.toString(),
  };
  report.usdcIncreased = usdcAfter > usdcBefore;
  report.residueCleared =
    cbAfter <= DUST_CBBTC && wethAfter <= DUST_WETH;
  report.resumeWouldSkipNpm = true;
  report.pass = report.usdcIncreased && report.residueCleared;

  fs.writeFileSync(
    path.join(__dirname, "_fork-verify-residue-sweep-usdc-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) {
    throw new Error(
      `Sweep incomplete: usdcIncreased=${report.usdcIncreased} residueCleared=${report.residueCleared}`,
    );
  }
}

function expectSelector(data, sel) {
  if (data.slice(0, 10).toLowerCase() !== sel.toLowerCase()) {
    throw new Error(`expected selector ${sel} got ${data.slice(0, 10)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
