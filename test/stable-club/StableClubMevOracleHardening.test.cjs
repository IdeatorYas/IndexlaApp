const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const POOL_ID = ethers.keccak256(
  ethers.toUtf8Bytes("INDEXLA_STABLE_CLUB_MEV_ORACLE_HARDENING_POOL"),
);

async function deployOracleMevStack() {
  const [deployer, user] = await ethers.getSigners();

  const oracleGuard = await ethers.deployContract("OracleGuard");
  const mevGuard = await ethers.deployContract("MevGuard");
  await mevGuard.setOracle(await oracleGuard.getAddress());

  const usdc = await ethers.deployContract("MockERC20", ["USD Coin", "USDC", 6]);
  const weth = await ethers.deployContract("MockERC20", ["Wrapped Ether", "WETH", 18]);
  const usdcFeed = await ethers.deployContract("MockAggregatorV3", [1_00000000n]); // $1
  const wethFeed = await ethers.deployContract("MockAggregatorV3", [2_000_00000000n]); // $2000

  await oracleGuard.configureFeed(await usdc.getAddress(), await usdcFeed.getAddress(), 3600, 8);
  await oracleGuard.configureFeed(await weth.getAddress(), await wethFeed.getAddress(), 3600, 8);

  await usdc.mint(user.address, ethers.parseUnits("1000000", 6));
  await weth.mint(user.address, ethers.parseEther("1000"));

  return { deployer, user, oracleGuard, mevGuard, usdc, weth, usdcFeed, wethFeed };
}

describe("Pre-Bugbot — oracle-priced MevGuard", function () {
  it("values USDC↔WETH across unequal decimals using oracle expectedOut", async function () {
    const ctx = await deployOracleMevStack();
    const now = await time.latest();
    const amountIn = ethers.parseUnits("2000", 6); // $2000 USDC → 1 WETH at $2000
    const expected = await ctx.oracleGuard.expectedAmountOut(
      await ctx.usdc.getAddress(),
      await ctx.weth.getAddress(),
      amountIn,
      6,
      18,
    );
    expect(expected).to.equal(ethers.parseEther("1"));

    const minOut = (expected * 9900n) / 10000n; // 1% slippage
    await ctx.mevGuard.assertSwapProtections(
      await ctx.usdc.getAddress(),
      await ctx.weth.getAddress(),
      amountIn,
      minOut,
      expected,
      100n,
      now + 60,
    );

    // Reverse: 1 WETH → 2000 USDC
    const wethIn = ethers.parseEther("1");
    const expectedUsdc = await ctx.oracleGuard.expectedAmountOut(
      await ctx.weth.getAddress(),
      await ctx.usdc.getAddress(),
      wethIn,
      18,
      6,
    );
    expect(expectedUsdc).to.equal(ethers.parseUnits("2000", 6));
  });

  it("rejects manipulated keeper quotes above/below oracle impact band", async function () {
    const ctx = await deployOracleMevStack();
    const now = await time.latest();
    const amountIn = ethers.parseUnits("2000", 6);
    const expected = await ctx.oracleGuard.expectedAmountOut(
      await ctx.usdc.getAddress(),
      await ctx.weth.getAddress(),
      amountIn,
      6,
      18,
    );
    const minOut = (expected * 9900n) / 10000n;

    // Inflated quote (> +1.5%)
    await expect(
      ctx.mevGuard.assertSwapProtections(
        await ctx.usdc.getAddress(),
        await ctx.weth.getAddress(),
        amountIn,
        minOut,
        (expected * 10300n) / 10000n,
        100n,
        now + 60,
      ),
    ).to.be.revertedWithCustomError(ctx.mevGuard, "InvalidQuote");

    // Depressed quote (< -1.5%)
    await expect(
      ctx.mevGuard.assertSwapProtections(
        await ctx.usdc.getAddress(),
        await ctx.weth.getAddress(),
        amountIn,
        minOut,
        (expected * 9700n) / 10000n,
        100n,
        now + 60,
      ),
    ).to.be.revertedWithCustomError(ctx.mevGuard, "PriceImpactTooHigh");
  });

  it("rejects stale or invalid oracle data", async function () {
    const ctx = await deployOracleMevStack();
    const now = await time.latest();
    const amountIn = ethers.parseUnits("100", 6);

    await ctx.wethFeed.setUpdatedAt(now - 10_000);
    await expect(
      ctx.oracleGuard.expectedAmountOut(
        await ctx.usdc.getAddress(),
        await ctx.weth.getAddress(),
        amountIn,
        6,
        18,
      ),
    ).to.be.revertedWithCustomError(ctx.oracleGuard, "StaleFeed");

    await ctx.wethFeed.setAnswer(0);
    await ctx.wethFeed.setUpdatedAt(now);
    await expect(
      ctx.mevGuard.assertSwapProtections(
        await ctx.usdc.getAddress(),
        await ctx.weth.getAddress(),
        amountIn,
        1n,
        1n,
        100n,
        now + 60,
      ),
    ).to.be.revertedWithCustomError(ctx.oracleGuard, "InvalidRound");
  });

  it("rejects excessive slippage vs oracle expectedOut", async function () {
    const ctx = await deployOracleMevStack();
    const now = await time.latest();
    const amountIn = ethers.parseUnits("2000", 6);
    const expected = await ctx.oracleGuard.expectedAmountOut(
      await ctx.usdc.getAddress(),
      await ctx.weth.getAddress(),
      amountIn,
      6,
      18,
    );

    // Permission allows only 50 bps but minOut is 5% below expected
    const tooLow = (expected * 9500n) / 10000n;
    await expect(
      ctx.mevGuard.assertSwapProtections(
        await ctx.usdc.getAddress(),
        await ctx.weth.getAddress(),
        amountIn,
        tooLow,
        expected,
        50n,
        now + 60,
      ),
    ).to.be.revertedWithCustomError(ctx.mevGuard, "ExcessiveSlippage");
  });
});

describe("Pre-Bugbot — H4 adapter dust refund", function () {
  it("refunds residual mint tokens to LP owner and clears simulated NPM approvals", async function () {
    const [deployer, user] = await ethers.getSigners();
    const automation = deployer.address; // executor role for mock

    const adapter = await ethers.deployContract("MockConcentratedLiquidityAdapter", [
      automation,
      POOL_ID,
      "uniswap-v3",
    ]);
    await adapter.setDustLeaveBps(1000); // 10% residual

    const usdc = await ethers.deployContract("MockERC20", ["USD Coin", "USDC", 6]);
    const weth = await ethers.deployContract("MockERC20", ["Wrapped Ether", "WETH", 18]);
    const amountA = ethers.parseUnits("1000", 6);
    const amountB = ethers.parseEther("1");

    await usdc.mint(deployer.address, amountA);
    await weth.mint(deployer.address, amountB);
    await usdc.approve(await adapter.getAddress(), amountA);
    await weth.approve(await adapter.getAddress(), amountB);

    const userUsdcBefore = await usdc.balanceOf(user.address);
    const userWethBefore = await weth.balanceOf(user.address);

    await adapter.mintPosition(
      user.address,
      await usdc.getAddress(),
      await weth.getAddress(),
      -100,
      100,
      amountA,
      amountB,
      1,
      1,
    );

    const dustA = (amountA * 1000n) / 10000n;
    const dustB = (amountB * 1000n) / 10000n;
    expect(await usdc.balanceOf(user.address)).to.equal(userUsdcBefore + dustA);
    expect(await weth.balanceOf(user.address)).to.equal(userWethBefore + dustB);

    // Used inventory remains on adapter; dust refunded
    expect(await usdc.balanceOf(await adapter.getAddress())).to.equal(amountA - dustA);
    expect(await weth.balanceOf(await adapter.getAddress())).to.equal(amountB - dustB);

    const simulatedNpm = await adapter.SIMULATED_NPM();
    expect(await usdc.allowance(await adapter.getAddress(), simulatedNpm)).to.equal(0n);
    expect(await weth.allowance(await adapter.getAddress(), simulatedNpm)).to.equal(0n);
  });
});
