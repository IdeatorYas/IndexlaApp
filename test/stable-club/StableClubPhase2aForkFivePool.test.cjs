const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const CBBTC = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
const WETH = "0x4200000000000000000000000000000000000006";

const UNI_FACTORY = "0x33128a8fC17869897dcE68Ed026d694621f6FDfD";
const UNI_NPM = "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1";
const UNI_ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481";

const AERO_FACTORY_CURRENT = "0xf8f2eB4940CFE7d13603DDDD87f123820Fc061Ef";
const AERO_NPM_CURRENT = "0xe1f8cd9AC4e4A65F54f38a5CdAfCA44f6dD68b53";
const AERO_ROUTER_CURRENT = "0x698Cb2b6dd822994581fEa6eA4Fc755d1363A92F";

const AERO_FACTORY_LEGACY = "0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A";
const AERO_NPM_LEGACY = "0x827922686190790b37229fd06084350e74485b72";
const AERO_ROUTER_LEGACY = "0xBE6D8f0d05cC4be24d5167a3eF062215bE6D18a5";

const IDENTITY_IFACE = new ethers.Interface(["error PoolIdentityMismatch()"]);

const POOLS = [
  {
    id: "USDC-cbBTC-AERO-CL100",
    protocol: "aerodrome-slipstream",
    generation: "aerodrome-legacy",
    poolAddress: "0x4e962bb3889bf030368f56810a9c96b83cb3e778",
    poolIdHash: ethers.id("INDEXLA_STABLE_CLUB_BASE_USDC_cbBTC_AERO_CL100"),
    tokenA: USDC,
    tokenB: CBBTC,
    tickSpacing: 100,
    factory: AERO_FACTORY_LEGACY,
    npm: AERO_NPM_LEGACY,
    router: AERO_ROUTER_LEGACY,
    mintAmounts: {
      [USDC]: ethers.parseUnits("25", 6),
      [CBBTC]: ethers.parseUnits("0.00025", 8),
    },
  },
  {
    id: "USDC-cbBTC-UNI-005",
    protocol: "uniswap-v3",
    generation: "uniswap-v3",
    poolAddress: "0xfBB6Eed8e7aa03B138556eeDaF5D271A5E1e43ef",
    poolIdHash: ethers.id("INDEXLA_STABLE_CLUB_BASE_USDC_cbBTC_UNI_005"),
    tokenA: USDC,
    tokenB: CBBTC,
    fee: 500,
    factory: UNI_FACTORY,
    npm: UNI_NPM,
    router: UNI_ROUTER,
    mintAmounts: {
      [USDC]: ethers.parseUnits("25", 6),
      [CBBTC]: ethers.parseUnits("0.00025", 8),
    },
  },
  {
    id: "cbBTC-WETH-AERO-CL10",
    protocol: "aerodrome-slipstream",
    generation: "aerodrome-current",
    poolAddress: "0x42d4a22CaD0F5a49681a5715cE994Af73A43B76b",
    poolIdHash: ethers.id("INDEXLA_STABLE_CLUB_BASE_cbBTC_WETH_AERO_CL10"),
    tokenA: CBBTC,
    tokenB: WETH,
    tickSpacing: 10,
    factory: AERO_FACTORY_CURRENT,
    npm: AERO_NPM_CURRENT,
    router: AERO_ROUTER_CURRENT,
    mintAmounts: {
      [CBBTC]: ethers.parseUnits("0.00005", 8),
      [WETH]: ethers.parseUnits("0.001", 18),
    },
  },
  {
    id: "cbBTC-WETH-AERO-CL100",
    protocol: "aerodrome-slipstream",
    generation: "aerodrome-legacy",
    poolAddress: "0x70acdf2ad0bf2402c957154f944c19ef4e1cbae1",
    poolIdHash: ethers.id("INDEXLA_STABLE_CLUB_BASE_cbBTC_WETH_AERO_CL100"),
    tokenA: CBBTC,
    tokenB: WETH,
    tickSpacing: 100,
    factory: AERO_FACTORY_LEGACY,
    npm: AERO_NPM_LEGACY,
    router: AERO_ROUTER_LEGACY,
    mintAmounts: {
      [CBBTC]: ethers.parseUnits("0.00005", 8),
      [WETH]: ethers.parseUnits("0.001", 18),
    },
  },
  {
    id: "cbBTC-WETH-UNI-005",
    protocol: "uniswap-v3",
    generation: "uniswap-v3",
    poolAddress: "0x7AeA2E8A3843516afa07293a10Ac8E49906dabD1",
    poolIdHash: ethers.id("INDEXLA_STABLE_CLUB_BASE_cbBTC_WETH_UNI_005"),
    tokenA: CBBTC,
    tokenB: WETH,
    fee: 500,
    factory: UNI_FACTORY,
    npm: UNI_NPM,
    router: UNI_ROUTER,
    mintAmounts: {
      [CBBTC]: ethers.parseUnits("0.00005", 8),
      [WETH]: ethers.parseUnits("0.001", 18),
    },
  },
];

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
];

const POOL_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function liquidity() view returns (uint128)",
  "function fee() view returns (uint24)",
  "function tickSpacing() view returns (int24)",
];

async function readPoolTick(poolAddress) {
  const slot0Raw = await ethers.provider.call({ to: poolAddress, data: "0x3850c7bd" });
  const tickWord = BigInt(`0x${slot0Raw.slice(66, 130)}`);
  return tickWord >= 1n << 255n ? Number(tickWord - (1n << 256n)) : Number(tickWord);
}

const ERC721_ABI = [
  "function ownerOf(uint256 tokenId) view returns (address)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
];

async function resetBaseFork() {
  if (!process.env.BASE_RPC_URL?.trim()) return false;
  await network.provider.request({
    method: "hardhat_reset",
    params: [{ forking: { jsonRpcUrl: process.env.BASE_RPC_URL } }],
  });
  await network.provider.send("evm_mine", []);
  return true;
}

async function pullFromPool(pool, token, to, amount) {
  const erc20 = await ethers.getContractAt(ERC20_ABI, token);
  const bal = await erc20.balanceOf(pool);
  if (bal < amount) throw new Error(`pool ${pool} lacks ${token}`);
  await network.provider.request({ method: "hardhat_impersonateAccount", params: [pool] });
  await network.provider.send("hardhat_setBalance", [pool, "0x56BC75E2D63100000"]);
  const signer = await ethers.getSigner(pool);
  await erc20.connect(signer).transfer(to, amount);
}

function alignTick(tick, spacing) {
  const compressed = Math.trunc(Number(tick) / spacing);
  return compressed * spacing;
}

function sortedPair(a, b) {
  return a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
}

async function factoryResolvesPool(spec) {
  if (spec.protocol === "uniswap-v3") {
    const factory = await ethers.getContractAt(
      ["function getPool(address,address,uint24) view returns (address)"],
      spec.factory,
    );
    return factory.getPool(spec.tokenA, spec.tokenB, spec.fee);
  }
  const factory = await ethers.getContractAt(
    ["function getPool(address,address,int24) view returns (address)"],
    spec.factory,
  );
  return factory.getPool(spec.tokenA, spec.tokenB, spec.tickSpacing);
}

async function verifyPoolMetadata(spec) {
  const code = await ethers.provider.getCode(spec.poolAddress);
  expect(code, `${spec.id} bytecode`).to.not.equal("0x");

  const pool = await ethers.getContractAt(POOL_ABI, spec.poolAddress);
  const token0 = await pool.token0();
  const token1 = await pool.token1();
  const [expected0, expected1] = sortedPair(spec.tokenA, spec.tokenB);
  expect(token0.toLowerCase()).to.equal(expected0.toLowerCase());
  expect(token1.toLowerCase()).to.equal(expected1.toLowerCase());

  const liquidity = await pool.liquidity();
  expect(liquidity, `${spec.id} liquidity`).to.be.gt(0n);

  if (spec.protocol === "uniswap-v3") {
    const fee = Number(await pool.fee());
    expect(fee).to.equal(spec.fee);
  } else {
    const tickSpacing = Number(await pool.tickSpacing());
    expect(tickSpacing).to.equal(spec.tickSpacing);
  }

  const resolved = await factoryResolvesPool(spec);
  expect(resolved.toLowerCase()).to.equal(spec.poolAddress.toLowerCase());
}

async function deployAdapter(deployer, spec) {
  if (spec.protocol === "uniswap-v3") {
    return ethers.deployContract("UniswapV3Adapter", [
      deployer.address,
      spec.poolIdHash,
      spec.npm,
      spec.router,
      spec.poolAddress,
      spec.factory,
      spec.fee,
    ]);
  }
  return ethers.deployContract("AerodromeSlipstreamAdapter", [
    deployer.address,
    spec.poolIdHash,
    spec.npm,
    spec.router,
    spec.poolAddress,
    spec.factory,
    spec.tickSpacing,
    ethers.ZeroAddress,
  ]);
}

async function mintViaAdapter(deployer, user, spec) {
  const pool = await ethers.getContractAt(POOL_ABI, spec.poolAddress);
  const tick = await readPoolTick(spec.poolAddress);
  const spacing = spec.protocol === "uniswap-v3" ? Number(await pool.tickSpacing()) : spec.tickSpacing;
  const tickLower = alignTick(tick - spacing * 20, spacing);
  const tickUpper = alignTick(tick + spacing * 20, spacing);

  const amountA = spec.mintAmounts[spec.tokenA];
  const amountB = spec.mintAmounts[spec.tokenB];
  await pullFromPool(spec.poolAddress, spec.tokenA, deployer.address, amountA * 3n);
  await pullFromPool(spec.poolAddress, spec.tokenB, deployer.address, amountB * 3n);

  const adapter = await deployAdapter(deployer, spec);
  const tokenAContract = await ethers.getContractAt(ERC20_ABI, spec.tokenA);
  const tokenBContract = await ethers.getContractAt(ERC20_ABI, spec.tokenB);
  await tokenAContract.approve(await adapter.getAddress(), ethers.MaxUint256);
  await tokenBContract.approve(await adapter.getAddress(), ethers.MaxUint256);

  await (
    await adapter.mintPosition(
      user.address,
      spec.tokenA,
      spec.tokenB,
      tickLower,
      tickUpper,
      amountA,
      amountB,
      0,
      0,
    )
  ).wait();

  const npm = await ethers.getContractAt(ERC721_ABI, spec.npm);
  const mintLogs = await npm.queryFilter(npm.filters.Transfer(ethers.ZeroAddress, user.address), -5);
  expect(mintLogs.length, `${spec.id} mint Transfer`).to.be.greaterThan(0);
  const tokenId = mintLogs[mintLogs.length - 1].args.tokenId;

  expect(await adapter.ownerOf(tokenId)).to.equal(user.address);
  const [a0, a1] = await adapter.positionAmounts(tokenId);
  expect(a0 + a1, `${spec.id} position value`).to.be.gt(0n);

  return { adapter, tokenId };
}

const TOTAL_TESTS = POOLS.length * 2 + 1;

describe("Stable Club Phase 2a — five official Base fork pools", function () {
  this.timeout(600_000);

  let forkAvailable = false;

  before(async function () {
    forkAvailable = await resetBaseFork();
    if (!forkAvailable) this.skip();
  });

  after(async function () {
    await network.provider.request({ method: "hardhat_reset", params: [] });
    // eslint-disable-next-line no-console
    console.log(
      forkAvailable
        ? `\n[StableClubPhase2aForkFivePool] ${TOTAL_TESTS} tests executed (5 pools × verify + mint + wrong-generation guard)\n`
        : `\n[StableClubPhase2aForkFivePool] ${TOTAL_TESTS} tests pending — skipped (set BASE_RPC_URL to run Base fork suite)\n`,
    );
  });

  for (const spec of POOLS) {
    describe(spec.id, function () {
      it("has live bytecode, tokens, fee/tickSpacing, liquidity, and matching factory generation", async function () {
        await verifyPoolMetadata(spec);
      });

      it("mints a small position to user via correct-generation adapter", async function () {
        const [deployer, user] = await ethers.getSigners();
        await mintViaAdapter(deployer, user, spec);
      });
    });
  }

  it("rejects wrong-generation Aerodrome adapter against legacy USDC/cbBTC CL100 pool", async function () {
    const legacy = POOLS.find((p) => p.id === "USDC-cbBTC-AERO-CL100");
    const [deployer, user] = await ethers.getSigners();

    const wrongAdapter = await ethers.deployContract("AerodromeSlipstreamAdapter", [
      deployer.address,
      legacy.poolIdHash,
      AERO_NPM_CURRENT,
      AERO_ROUTER_CURRENT,
      legacy.poolAddress,
      AERO_FACTORY_CURRENT,
      legacy.tickSpacing,
      ethers.ZeroAddress,
    ]);

    const tick = await readPoolTick(legacy.poolAddress);
    const spacing = legacy.tickSpacing;
    const tickLower = alignTick(tick - spacing * 20, spacing);
    const tickUpper = alignTick(tick + spacing * 20, spacing);

    const amountUsdc = legacy.mintAmounts[USDC];
    const amountCbbtc = legacy.mintAmounts[CBBTC];
    await pullFromPool(legacy.poolAddress, USDC, deployer.address, amountUsdc * 3n);
    await pullFromPool(legacy.poolAddress, CBBTC, deployer.address, amountCbbtc * 3n);

    const usdc = await ethers.getContractAt(ERC20_ABI, USDC);
    const cbbtc = await ethers.getContractAt(ERC20_ABI, CBBTC);
    await usdc.approve(await wrongAdapter.getAddress(), ethers.MaxUint256);
    await cbbtc.approve(await wrongAdapter.getAddress(), ethers.MaxUint256);

    let mintedTokenId;
    try {
      await (
        await wrongAdapter.mintPosition(
          user.address,
          USDC,
          CBBTC,
          tickLower,
          tickUpper,
          amountUsdc,
          amountCbbtc,
          0,
          0,
        )
      ).wait();
      const npm = await ethers.getContractAt(ERC721_ABI, AERO_NPM_CURRENT);
      const logs = await npm.queryFilter(npm.filters.Transfer(ethers.ZeroAddress, user.address), -3);
      if (logs.length > 0) mintedTokenId = logs[logs.length - 1].args.tokenId;
    } catch {
      mintedTokenId = undefined;
    }

    if (mintedTokenId != null) {
      await expect(wrongAdapter.positionAmounts(mintedTokenId)).to.be.revertedWithCustomError(
        { interface: IDENTITY_IFACE },
        "PoolIdentityMismatch",
      );
      return;
    }

    const currentFactoryPool = await factoryResolvesPool({
      ...legacy,
      factory: AERO_FACTORY_CURRENT,
    });
    expect(currentFactoryPool.toLowerCase()).to.not.equal(legacy.poolAddress.toLowerCase());

    await expect(
      wrongAdapter.mintPosition(
        user.address,
        USDC,
        CBBTC,
        tickLower,
        tickUpper,
        amountUsdc,
        amountCbbtc,
        0,
        0,
      ),
    ).to.be.reverted;
  });
});
