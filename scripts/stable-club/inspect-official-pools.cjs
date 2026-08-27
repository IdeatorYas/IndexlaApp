/**
 * Read-only Base fork inspection of the five official Stable Club pools.
 * Does not send transactions or use real funds.
 *
 * Usage: npx hardhat run scripts/stable-club/inspect-official-pools.cjs --network hardhat
 * Requires BASE_RPC_URL (loaded from hardhat.config / env).
 */
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

function loadEnvLocal() {
  const p = path.join(__dirname, "../../.env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const CBBTC = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
const WETH = "0x4200000000000000000000000000000000000006";
const UNI_FACTORY = "0x33128a8fC17869897dcE68Ed026d694621f6FDfD";
const AERO_FACTORY = "0xf8f2eB4940CFE7d13603DDDD87f123820Fc061Ef";

// Common Chainlink feeds on Base (public addresses; verify live).
const FEEDS = {
  USDC_USD: "0x7e860098F58bBFC8648a4311b374B1D669Be50fE",
  ETH_USD: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70",
  // cbBTC often proxied via BTC/USD on Base
  BTC_USD: "0x64c911996D3c6aC71f9bDa319F22aD0632Dd249B",
};

const POOLS = [
  {
    id: "USDC-cbBTC-AERO-CL100",
    protocol: "aerodrome-slipstream",
    tokenA: USDC,
    tokenB: CBBTC,
    tickSpacing: 100,
    riskLevel: "medium",
    pair: "USDC/cbBTC",
  },
  {
    id: "USDC-cbBTC-UNI-005",
    protocol: "uniswap-v3",
    tokenA: USDC,
    tokenB: CBBTC,
    fee: 500,
    riskLevel: "medium",
    pair: "USDC/cbBTC",
  },
  {
    id: "cbBTC-WETH-AERO-CL10",
    protocol: "aerodrome-slipstream",
    tokenA: CBBTC,
    tokenB: WETH,
    tickSpacing: 10,
    riskLevel: "high",
    pair: "cbBTC/WETH",
  },
  {
    id: "cbBTC-WETH-AERO-CL100",
    protocol: "aerodrome-slipstream",
    tokenA: CBBTC,
    tokenB: WETH,
    tickSpacing: 100,
    riskLevel: "high",
    pair: "cbBTC/WETH",
  },
  {
    id: "cbBTC-WETH-UNI-005",
    protocol: "uniswap-v3",
    tokenA: CBBTC,
    tokenB: WETH,
    fee: 500,
    riskLevel: "high",
    pair: "cbBTC/WETH",
  },
];

async function readFeed(feedAddr) {
  const feed = await ethers.getContractAt(
    [
      "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
      "function decimals() view returns (uint8)",
      "function description() view returns (string)",
    ],
    feedAddr,
  );
  try {
    const [, answer, , updatedAt] = await feed.latestRoundData();
    const decimals = await feed.decimals();
    const description = await feed.description();
    const ageSec = Math.max(0, Math.floor(Date.now() / 1000) - Number(updatedAt));
    return {
      address: feedAddr,
      description,
      decimals: Number(decimals),
      answer: answer.toString(),
      updatedAt: Number(updatedAt),
      ageSec,
      ok: answer > 0n && ageSec < 86_400,
    };
  } catch (e) {
    return { address: feedAddr, ok: false, error: String(e.message || e) };
  }
}

async function inspectPool(entry) {
  let poolAddr = ethers.ZeroAddress;
  if (entry.protocol === "uniswap-v3") {
    const factory = await ethers.getContractAt(
      ["function getPool(address,address,uint24) view returns (address)"],
      UNI_FACTORY,
    );
    poolAddr = await factory.getPool(entry.tokenA, entry.tokenB, entry.fee);
  } else {
    const factory = await ethers.getContractAt(
      ["function getPool(address,address,int24) view returns (address)"],
      AERO_FACTORY,
    );
    poolAddr = await factory.getPool(entry.tokenA, entry.tokenB, entry.tickSpacing);
  }

  if (poolAddr === ethers.ZeroAddress) {
    return { ...entry, poolAddress: null, exists: false };
  }

  const pool = await ethers.getContractAt(
    [
      "function token0() view returns (address)",
      "function token1() view returns (address)",
      "function liquidity() view returns (uint128)",
      "function fee() view returns (uint24)",
      "function tickSpacing() view returns (int24)",
    ],
    poolAddr,
  );

  const token0 = await pool.token0();
  const token1 = await pool.token1();
  const liquidity = await pool.liquidity();

  // Uni and Aero slot0 layouts differ; read first two words only.
  const slot0Raw = await ethers.provider.call({
    to: poolAddr,
    data: "0x3850c7bd", // slot0()
  });
  const sqrtPriceX96 = BigInt(`0x${slot0Raw.slice(2, 66)}`);
  const tickWord = BigInt(`0x${slot0Raw.slice(66, 130)}`);
  const tick =
    tickWord >= 1n << 255n ? Number(tickWord - (1n << 256n)) : Number(tickWord);

  let fee = entry.fee ?? null;
  let tickSpacing = entry.tickSpacing ?? null;
  try {
    fee = Number(await pool.fee());
  } catch {
    /* aero may not expose fee the same way */
  }
  try {
    tickSpacing = Number(await pool.tickSpacing());
  } catch {
    /* */
  }

  const erc20 = ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)", "function symbol() view returns (string)"];
  const t0 = await ethers.getContractAt(erc20, token0);
  const t1 = await ethers.getContractAt(erc20, token1);
  const bal0 = await t0.balanceOf(poolAddr);
  const bal1 = await t1.balanceOf(poolAddr);
  const dec0 = Number(await t0.decimals());
  const dec1 = Number(await t1.decimals());
  const sym0 = await t0.symbol();
  const sym1 = await t1.symbol();

  return {
    id: entry.id,
    protocol: entry.protocol,
    pair: entry.pair,
    riskLevel: entry.riskLevel,
    exists: true,
    poolAddress: poolAddr,
    token0,
    token1,
    symbols: `${sym0}/${sym1}`,
    fee,
    tickSpacing,
    liquidity: liquidity.toString(),
    sqrtPriceX96: sqrtPriceX96.toString(),
    tick,
    tokenBalances: {
      [sym0]: ethers.formatUnits(bal0, dec0),
      [sym1]: ethers.formatUnits(bal1, dec1),
    },
    factory:
      entry.protocol === "uniswap-v3" ? UNI_FACTORY : AERO_FACTORY,
  };
}

async function main() {
  loadEnvLocal();
  if (!process.env.BASE_RPC_URL?.trim()) {
    throw new Error("BASE_RPC_URL required for pool inspection");
  }

  await network.provider.request({
    method: "hardhat_reset",
    params: [{ forking: { jsonRpcUrl: process.env.BASE_RPC_URL } }],
  });
  await network.provider.send("evm_mine", []);

  const block = await ethers.provider.getBlock("latest");
  const gasPrice = await ethers.provider.getFeeData();

  const oracles = {
    USDC_USD: await readFeed(FEEDS.USDC_USD),
    ETH_USD: await readFeed(FEEDS.ETH_USD),
    BTC_USD: await readFeed(FEEDS.BTC_USD),
  };

  const pools = [];
  for (const entry of POOLS) {
    pools.push(await inspectPool(entry));
  }

  const report = {
    inspectedAt: new Date().toISOString(),
    chainId: 8453,
    forkBlock: block?.number ?? null,
    gas: {
      gasPriceWei: gasPrice.gasPrice?.toString() ?? null,
      maxFeePerGasWei: gasPrice.maxFeePerGas?.toString() ?? null,
      maxPriorityFeePerGasWei: gasPrice.maxPriorityFeePerGas?.toString() ?? null,
      recommendedCeilingWei:
        gasPrice.maxFeePerGas != null
          ? (gasPrice.maxFeePerGas * 5n).toString()
          : null,
      note: "Recommended ceiling = 5x observed maxFeePerGas at inspection time; keep configurable.",
    },
    oracles,
    pools,
    notes: [
      "RLUSD/USDC and PYUSD/USDC are NOT in the official five-pool catalogue.",
      "poolAddress values are factory-derived on Base mainnet fork.",
      "No transactions were sent.",
    ],
  };

  const outDir = path.join(__dirname, "../../docs/stable-club/step3");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "official-pools-inspection.json");
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
