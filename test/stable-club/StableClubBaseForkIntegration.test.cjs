const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const CBBTC = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
const WETH = "0x4200000000000000000000000000000000000006";

const UNI_FACTORY = "0x33128a8fC17869897dcE68Ed026d694621f6FDfD";
const UNI_NPM = "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1";
const UNI_ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481";

const AERO_FACTORY = "0xf8f2eB4940CFE7d13603DDDD87f123820Fc061Ef";
const AERO_NPM = "0xe1f8cd9AC4e4A65F54f38a5CdAfCA44f6dD68b53";
const AERO_ROUTER = "0x698Cb2b6dd822994581fEa6eA4Fc755d1363A92F";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
];

const ERC721_ABI = [
  "function approve(address to, uint256 tokenId)",
  "function getApproved(uint256 tokenId) view returns (address)",
  "function ownerOf(uint256 tokenId) view returns (address)",
];

async function resetBaseFork() {
  if (!process.env.BASE_RPC_URL?.trim()) return false;
  await network.provider.request({
    method: "hardhat_reset",
    params: [{ forking: { jsonRpcUrl: process.env.BASE_RPC_URL } }],
  });
  // Hardhat/EDR on Base: mine once so eth_call is not on the raw historical fork tip.
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

describe("Stable Club — Base fork integration (Uni / Aerodrome)", function () {
  this.timeout(300_000);

  before(async function () {
    if (!(await resetBaseFork())) this.skip();
  });

  after(async function () {
    // Restore non-fork Hardhat so subsequent unit suites are not polluted.
    await network.provider.request({ method: "hardhat_reset", params: [] });
  });

  it("maps both token orderings, enforces per-token NFT approval, and values live NPM amounts", async function () {
    const [deployer, user] = await ethers.getSigners();

    const uniFactory = await ethers.getContractAt(
      ["function getPool(address,address,uint24) view returns (address)"],
      UNI_FACTORY,
    );
    const uniPoolAddr = await uniFactory.getPool(USDC, CBBTC, 500);
    expect(uniPoolAddr).to.not.equal(ethers.ZeroAddress);

    const uniPool = await ethers.getContractAt(
      [
        "function token0() view returns (address)",
        "function token1() view returns (address)",
        "function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)",
        "function tickSpacing() view returns (int24)",
      ],
      uniPoolAddr,
    );
    const [, tick] = await uniPool.slot0();
    const spacing = Number(await uniPool.tickSpacing());
    const tickLower = alignTick(Number(tick) - spacing * 20, spacing);
    const tickUpper = alignTick(Number(tick) + spacing * 20, spacing);

    const poolIdUni = ethers.id("INDEXLA_STABLE_CLUB_BASE_USDC_cbBTC_UNI_005");
    const uniAdapter = await ethers.deployContract("UniswapV3Adapter", [
      deployer.address,
      poolIdUni,
      UNI_NPM,
      UNI_ROUTER,
      uniPoolAddr,
      UNI_FACTORY,
      500,
    ]);

    const usdc = await ethers.getContractAt(ERC20_ABI, USDC);
    const cbbtc = await ethers.getContractAt(ERC20_ABI, CBBTC);
    const amountUsdc = ethers.parseUnits("25", 6);
    const amountBtc = ethers.parseUnits("0.00025", 8);

    await pullFromPool(uniPoolAddr, USDC, deployer.address, amountUsdc * 3n);
    await pullFromPool(uniPoolAddr, CBBTC, deployer.address, amountBtc * 3n);

    await usdc.approve(await uniAdapter.getAddress(), ethers.MaxUint256);
    await cbbtc.approve(await uniAdapter.getAddress(), ethers.MaxUint256);

    // Natural order
    await (await uniAdapter.mintPosition(
      user.address,
      USDC,
      CBBTC,
      tickLower,
      tickUpper,
      amountUsdc,
      amountBtc,
      0,
      0,
    )).wait();

    const npm = await ethers.getContractAt(
      [
        "event IncreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
        "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
        ...ERC721_ABI,
      ],
      UNI_NPM,
    );
    const mintLogs = await npm.queryFilter(npm.filters.Transfer(ethers.ZeroAddress, user.address), -3);
    expect(mintLogs.length).to.be.greaterThan(0);
    const tokenId = mintLogs[mintLogs.length - 1].args.tokenId;

    expect(await uniAdapter.ownerOf(tokenId)).to.equal(user.address);
    const [a0, a1] = await uniAdapter.positionAmounts(tokenId);
    expect(a0 + a1).to.be.gt(0n);

    // Unauthorized without approve
    await expect(uniAdapter.collectFees(user.address, tokenId, user.address)).to.be.revertedWithCustomError(
      uniAdapter,
      "AdapterNotApprovedForPosition",
    );

    // Per-token approve (not setApprovalForAll)
    await npm.connect(user).approve(await uniAdapter.getAddress(), tokenId);
    expect(await npm.getApproved(tokenId)).to.equal(await uniAdapter.getAddress());

    // Reversed token order on increaseLiquidity
    await uniAdapter.increaseLiquidity(
      user.address,
      tokenId,
      CBBTC,
      USDC,
      amountBtc,
      amountUsdc,
      0,
      0,
    );
    const [b0, b1] = await uniAdapter.positionAmounts(tokenId);
    expect(b0 + b1).to.be.gte(a0 + a1);

    await uniAdapter.collectFees(user.address, tokenId, user.address);

    // Aerodrome path when pool exists
    const aeroFactory = await ethers.getContractAt(
      ["function getPool(address tokenA, address tokenB, int24 tickSpacing) view returns (address)"],
      AERO_FACTORY,
    );
    const aeroPoolAddr = await aeroFactory.getPool(USDC, CBBTC, 100);
    if (aeroPoolAddr !== ethers.ZeroAddress) {
      const aeroPool = await ethers.getContractAt(
        [
          "function slot0() view returns (uint160,int24,uint16,uint16,uint16,bool)",
          "function tickSpacing() view returns (int24)",
        ],
        aeroPoolAddr,
      );
      const [, aeroTick] = await aeroPool.slot0();
      const aeroSpacing = 100;
      const aLower = alignTick(Number(aeroTick) - aeroSpacing * 20, aeroSpacing);
      const aUpper = alignTick(Number(aeroTick) + aeroSpacing * 20, aeroSpacing);

      await pullFromPool(aeroPoolAddr, USDC, deployer.address, amountUsdc);
      await pullFromPool(aeroPoolAddr, CBBTC, deployer.address, amountBtc);

      const aeroAdapter = await ethers.deployContract("AerodromeSlipstreamAdapter", [
        deployer.address,
        ethers.id("INDEXLA_STABLE_CLUB_BASE_USDC_cbBTC_AERO_CL100"),
        AERO_NPM,
        AERO_ROUTER,
        aeroPoolAddr,
        AERO_FACTORY,
        100,
        ethers.ZeroAddress,
      ]);
      await usdc.approve(await aeroAdapter.getAddress(), ethers.MaxUint256);
      await cbbtc.approve(await aeroAdapter.getAddress(), ethers.MaxUint256);

      // Reversed mint order
      await (await aeroAdapter.mintPosition(
        user.address,
        CBBTC,
        USDC,
        aLower,
        aUpper,
        amountBtc,
        amountUsdc,
        0,
        0,
      )).wait();

      const aeroNpm = await ethers.getContractAt(
        ["event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)", ...ERC721_ABI],
        AERO_NPM,
      );
      const aeroLogs = await aeroNpm.queryFilter(
        aeroNpm.filters.Transfer(ethers.ZeroAddress, user.address),
        -3,
      );
      const aeroTokenId = aeroLogs[aeroLogs.length - 1].args.tokenId;
      const [c0, c1] = await aeroAdapter.positionAmounts(aeroTokenId);
      expect(c0 + c1).to.be.gt(0n);

      await expect(aeroAdapter.collectFees(user.address, aeroTokenId, user.address)).to.be.revertedWithCustomError(
        aeroAdapter,
        "AdapterNotApprovedForPosition",
      );
      await aeroNpm.connect(user).approve(await aeroAdapter.getAddress(), aeroTokenId);
      await aeroAdapter.collectFees(user.address, aeroTokenId, user.address);
    }

    // cbBTC/WETH pool ordering smoke
    const uniWethPool = await uniFactory.getPool(CBBTC, WETH, 500);
    expect(uniWethPool).to.not.equal(ethers.ZeroAddress);
    const wethPool = await ethers.getContractAt(
      ["function token0() view returns (address)", "function token1() view returns (address)"],
      uniWethPool,
    );
    const t0 = (await wethPool.token0()).toLowerCase();
    const t1 = (await wethPool.token1()).toLowerCase();
    expect([t0, t1].sort()).to.deep.equal([CBBTC.toLowerCase(), WETH.toLowerCase()].sort());
  });
});
