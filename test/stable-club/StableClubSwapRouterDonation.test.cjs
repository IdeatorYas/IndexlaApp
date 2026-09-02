const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const ROUTE_ID = ethers.id("TEST_USDC_WETH");
const RATE_E18 = 10n ** 12n; // 1 USDC (6 dec) -> 1 WETH wei scale for simple math

async function deploySwapRouterFixture() {
  const [owner, executor, griefer] = await ethers.getSigners();

  const usdc = await ethers.deployContract("MockERC20", ["USD Coin", "USDC", 6]);
  const weth = await ethers.deployContract("MockERC20", ["Wrapped Ether", "WETH", 18]);
  const usdcAddr = await usdc.getAddress();
  const wethAddr = await weth.getAddress();

  const pool = await ethers.deployContract("MockClPoolForValuation", [
    usdcAddr,
    wethAddr,
    79228162514264337593543950336n,
  ]);
  const factory = await ethers.deployContract("MockUniV3FactoryForValuation");
  await factory.setPool(usdcAddr, wethAddr, 500, await pool.getAddress());

  const dexRouter = await ethers.deployContract("MockUniV3ExactInputRouter");
  await dexRouter.setRateE18(RATE_E18);

  const swapRouter = await ethers.deployContract("StableClubSwapRouter");
  const swapRouterAddr = await swapRouter.getAddress();
  await swapRouter.setExecutorApproved(executor.address, true);

  const route = {
    kind: 0, // UniswapV3
    router: await dexRouter.getAddress(),
    factory: await factory.getAddress(),
    pool: await pool.getAddress(),
    tokenIn: usdcAddr,
    tokenOut: wethAddr,
    feeOrTickSpacing: 500,
    enabled: true,
  };
  await swapRouter.configureRoute(ROUTE_ID, route);

  await weth.mint(await dexRouter.getAddress(), ethers.parseUnits("1000000", 18));

  return {
    owner,
    executor,
    griefer,
    usdc,
    weth,
    dexRouter,
    swapRouter,
    swapRouterAddr,
    deadline: BigInt((await time.latest()) + 3600),
  };
}

describe("StableClubSwapRouter — donated dust tolerance", function () {
  it("donated tokenIn dust cannot block a swap", async function () {
    const ctx = await deploySwapRouterFixture();
    const dustIn = 7n;
    const amountIn = ethers.parseUnits("100", 6);
    const minOut = 1n;

    await ctx.usdc.mint(ctx.swapRouterAddr, dustIn);
    await ctx.usdc.mint(ctx.executor.address, amountIn);
    await ctx.usdc.connect(ctx.executor).approve(ctx.swapRouterAddr, amountIn);

    const execWethBefore = await ctx.weth.balanceOf(ctx.executor.address);
    const expectedOut = (amountIn * RATE_E18) / 10n ** 18n;

    await ctx.swapRouter
      .connect(ctx.executor)
      .executeExactInput(ROUTE_ID, amountIn, minOut, ctx.deadline);

    expect(await ctx.usdc.balanceOf(ctx.swapRouterAddr)).to.equal(dustIn);
    expect(await ctx.weth.balanceOf(ctx.executor.address)).to.equal(execWethBefore + expectedOut);
  });

  it("donated tokenOut dust cannot block a swap", async function () {
    const ctx = await deploySwapRouterFixture();
    const dustOut = 11n;
    const amountIn = ethers.parseUnits("50", 6);
    const minOut = 1n;

    await ctx.weth.mint(ctx.swapRouterAddr, dustOut);
    await ctx.usdc.mint(ctx.executor.address, amountIn);
    await ctx.usdc.connect(ctx.executor).approve(ctx.swapRouterAddr, amountIn);

    const execWethBefore = await ctx.weth.balanceOf(ctx.executor.address);
    const expectedOut = (amountIn * RATE_E18) / 10n ** 18n;

    await ctx.swapRouter
      .connect(ctx.executor)
      .executeExactInput(ROUTE_ID, amountIn, minOut, ctx.deadline);

    expect(await ctx.weth.balanceOf(ctx.swapRouterAddr)).to.equal(dustOut);
    expect(await ctx.weth.balanceOf(ctx.executor.address)).to.equal(execWethBefore + expectedOut);
  });

  it("dust in both tokens cannot block a swap", async function () {
    const ctx = await deploySwapRouterFixture();
    const dustIn = 3n;
    const dustOut = 5n;
    const amountIn = ethers.parseUnits("25", 6);
    const minOut = 1n;

    await ctx.usdc.mint(ctx.swapRouterAddr, dustIn);
    await ctx.weth.mint(ctx.swapRouterAddr, dustOut);
    await ctx.usdc.mint(ctx.executor.address, amountIn);
    await ctx.usdc.connect(ctx.executor).approve(ctx.swapRouterAddr, amountIn);

    const execWethBefore = await ctx.weth.balanceOf(ctx.executor.address);
    const expectedOut = (amountIn * RATE_E18) / 10n ** 18n;

    await ctx.swapRouter
      .connect(ctx.executor)
      .executeExactInput(ROUTE_ID, amountIn, minOut, ctx.deadline);

    expect(await ctx.usdc.balanceOf(ctx.swapRouterAddr)).to.equal(dustIn);
    expect(await ctx.weth.balanceOf(ctx.swapRouterAddr)).to.equal(dustOut);
    expect(await ctx.weth.balanceOf(ctx.executor.address)).to.equal(execWethBefore + expectedOut);
  });

  it("recipient receives only the current swap output", async function () {
    const ctx = await deploySwapRouterFixture();
    const dustOut = 99n;
    const amountIn = ethers.parseUnits("10", 6);
    const minOut = 1n;

    await ctx.weth.mint(ctx.swapRouterAddr, dustOut);
    await ctx.usdc.mint(ctx.executor.address, amountIn);
    await ctx.usdc.connect(ctx.executor).approve(ctx.swapRouterAddr, amountIn);

    const execWethBefore = await ctx.weth.balanceOf(ctx.executor.address);
    const expectedOut = (amountIn * RATE_E18) / 10n ** 18n;

    await ctx.swapRouter
      .connect(ctx.executor)
      .executeExactInput(ROUTE_ID, amountIn, minOut, ctx.deadline);

    const wethReceived = (await ctx.weth.balanceOf(ctx.executor.address)) - execWethBefore;
    expect(wethReceived).to.equal(expectedOut);
    expect(wethReceived).to.not.equal(dustOut);
    expect(await ctx.weth.balanceOf(ctx.swapRouterAddr)).to.equal(dustOut);
  });

  it("pre-existing dust remains unchanged after swap", async function () {
    const ctx = await deploySwapRouterFixture();
    const dustIn = 13n;
    const dustOut = 17n;
    const amountIn = ethers.parseUnits("40", 6);
    const minOut = 1n;

    await ctx.usdc.mint(ctx.swapRouterAddr, dustIn);
    await ctx.weth.mint(ctx.swapRouterAddr, dustOut);
    await ctx.usdc.mint(ctx.executor.address, amountIn);
    await ctx.usdc.connect(ctx.executor).approve(ctx.swapRouterAddr, amountIn);

    await ctx.swapRouter
      .connect(ctx.executor)
      .executeExactInput(ROUTE_ID, amountIn, minOut, ctx.deadline);

    expect(await ctx.usdc.balanceOf(ctx.swapRouterAddr)).to.equal(dustIn);
    expect(await ctx.weth.balanceOf(ctx.swapRouterAddr)).to.equal(dustOut);
  });

  it("reverts when swap output is below minAmountOut", async function () {
    const ctx = await deploySwapRouterFixture();
    const amountIn = ethers.parseUnits("1", 6);
    const minOut = ethers.parseUnits("1000", 18);

    await ctx.usdc.mint(ctx.executor.address, amountIn);
    await ctx.usdc.connect(ctx.executor).approve(ctx.swapRouterAddr, amountIn);

    await expect(
      ctx.swapRouter
        .connect(ctx.executor)
        .executeExactInput(ROUTE_ID, amountIn, minOut, ctx.deadline),
    ).to.be.reverted;
  });

  it("clears router allowance after swap", async function () {
    const ctx = await deploySwapRouterFixture();
    const amountIn = ethers.parseUnits("5", 6);
    const minOut = 1n;

    await ctx.usdc.mint(ctx.executor.address, amountIn);
    await ctx.usdc.connect(ctx.executor).approve(ctx.swapRouterAddr, amountIn);

    const dexAddr = await ctx.dexRouter.getAddress();
    const usdcAddr = await ctx.usdc.getAddress();

    await ctx.swapRouter
      .connect(ctx.executor)
      .executeExactInput(ROUTE_ID, amountIn, minOut, ctx.deadline);

    expect(await ctx.usdc.allowance(ctx.swapRouterAddr, dexAddr)).to.equal(0n);
  });

  it("griefer donation before user swap does not brick subsequent swaps", async function () {
    const ctx = await deploySwapRouterFixture();
    const amountIn = ethers.parseUnits("20", 6);
    const minOut = 1n;

    await ctx.usdc.mint(ctx.swapRouterAddr, 1n);
    await ctx.weth.mint(ctx.swapRouterAddr, 1n);

    await ctx.usdc.mint(ctx.executor.address, amountIn);
    await ctx.usdc.connect(ctx.executor).approve(ctx.swapRouterAddr, amountIn);

    await ctx.swapRouter
      .connect(ctx.executor)
      .executeExactInput(ROUTE_ID, amountIn, minOut, ctx.deadline);

    expect(await ctx.usdc.balanceOf(ctx.swapRouterAddr)).to.equal(1n);
    expect(await ctx.weth.balanceOf(ctx.swapRouterAddr)).to.equal(1n);
  });
});
