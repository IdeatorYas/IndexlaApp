const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const {
  deployStableClubStack,
  POOL_ID,
  approvePermit2Pull,
} = require("../../scripts/stable-club/deploy-local.cjs");

const ALL_ACTIONS =
  (1n << 0n) |
  (1n << 1n) |
  (1n << 2n) |
  (1n << 3n) |
  (1n << 4n) |
  (1n << 6n) |
  (1n << 7n);

async function registerPermission(ctx) {
  const perm = {
    user: ctx.testUser.address,
    chainId: (await ethers.provider.getNetwork()).chainId,
    poolId: POOL_ID,
    tokenA: ctx.usdc,
    tokenB: ctx.weth,
    allowedActions: ALL_ACTIONS,
    maxAmountPerTx: ethers.parseUnits("5000", 6),
    maxAmountPerDay: ethers.parseUnits("20000", 6),
    maxSlippageBps: 500n,
    minTimeBetweenExecutions: 0n,
    maxExecutionsPerDay: 20n,
    expiresAt: BigInt((await time.latest()) + 86400 * 7),
    revoked: false,
    paused: false,
  };
  await ctx.permissionRegistryContract.connect(ctx.testUser).registerPermission(perm);
  return ctx.permissionRegistryContract.permissionIdFor(
    perm.user,
    perm.chainId,
    perm.poolId,
    perm.tokenA,
    perm.tokenB,
  );
}

describe("Final audit fixes — donation grief / Permit2 fail-closed / Step1 swap", function () {
  it("donated USDC and WETH dust does not block deposit and is not transferred to caller", async function () {
    const ctx = await deployStableClubStack();
    const permissionId = await registerPermission(ctx);
    const deposit = ethers.parseUnits("200", 6);
    const dustUsdc = 7n;
    const dustWeth = 11n;

    await ctx.usdcContract.mint(ctx.executor, dustUsdc);
    await ctx.wethContract.mint(ctx.executor, dustWeth);
    expect(await ctx.usdcContract.balanceOf(ctx.executor)).to.equal(dustUsdc);
    expect(await ctx.wethContract.balanceOf(ctx.executor)).to.equal(dustWeth);

    const userUsdcBefore = await ctx.usdcContract.balanceOf(ctx.testUser.address);
    await approvePermit2Pull(
      ctx.usdcContract,
      ctx.testUser,
      ctx.permit2Contract,
      ctx.executor,
      deposit,
    );

    await ctx.executorContract.connect(ctx.testUser).depositAndAddLiquidity(
      permissionId,
      1n,
      ctx.testAdapter,
      ctx.usdc,
      ctx.usdc,
      ctx.weth,
      deposit,
      0n,
      0n,
      1n,
      50n,
    );

    // Pre-existing dust remains on executor — not swept to the user.
    expect(await ctx.usdcContract.balanceOf(ctx.executor)).to.equal(dustUsdc);
    expect(await ctx.wethContract.balanceOf(ctx.executor)).to.equal(dustWeth);
    expect(await ctx.usdcContract.balanceOf(ctx.testUser.address)).to.equal(userUsdcBefore - deposit);
    expect(await ctx.testAdapterContract.balanceOf(ctx.testUser.address)).to.be.gt(0n);
  });

  it("unset Permit2 rejects FeeRouter and Executor pulls; ERC20 allowance alone is forbidden", async function () {
    const [deployer, user, feeRecipient] = await ethers.getSigners();
    const permissionRegistry = await ethers.deployContract("PermissionRegistry");
    const feeRouter = await ethers.deployContract("FeeRouter", [feeRecipient.address]);
    const executor = await ethers.deployContract("StableClubExecutor", [
      await permissionRegistry.getAddress(),
      await feeRouter.getAddress(),
    ]);
    await permissionRegistry.setOperator(await executor.getAddress(), true);
    await feeRouter.wireExecutor(await executor.getAddress());

    const testAdapter = await ethers.deployContract("TestPoolAdapter", [
      await executor.getAddress(),
    ]);
    const usdc = await ethers.deployContract("MockERC20", ["USD Coin", "USDC", 6]);
    const weth = await ethers.deployContract("MockERC20", ["Wrapped Ether", "WETH", 18]);
    await executor.setAdapterApproval(await testAdapter.getAddress(), true);
    await executor.registerPool(POOL_ID, await testAdapter.getAddress(), true);
    await executor.setTokenApproval(await usdc.getAddress(), true);
    await executor.setTokenApproval(await weth.getAddress(), true);
    await usdc.mint(user.address, ethers.parseUnits("1000", 6));
    await weth.mint(await testAdapter.getAddress(), ethers.parseEther("1000"));
    await usdc.mint(await testAdapter.getAddress(), ethers.parseUnits("1000", 6));

    expect(await executor.permit2()).to.equal(ethers.ZeroAddress);
    expect(await feeRouter.permit2()).to.equal(ethers.ZeroAddress);

    const deposit = ethers.parseUnits("100", 6);
    await usdc.connect(user).approve(await executor.getAddress(), deposit);
    await usdc.connect(user).approve(await feeRouter.getAddress(), deposit);

    const perm = {
      user: user.address,
      chainId: (await ethers.provider.getNetwork()).chainId,
      poolId: POOL_ID,
      tokenA: await usdc.getAddress(),
      tokenB: await weth.getAddress(),
      allowedActions: ALL_ACTIONS,
      maxAmountPerTx: ethers.parseUnits("5000", 6),
      maxAmountPerDay: ethers.parseUnits("20000", 6),
      maxSlippageBps: 500n,
      minTimeBetweenExecutions: 0n,
      maxExecutionsPerDay: 20n,
      expiresAt: BigInt((await time.latest()) + 86400),
      revoked: false,
      paused: false,
    };
    await permissionRegistry.connect(user).registerPermission(perm);
    const permissionId = await permissionRegistry.permissionIdFor(
      perm.user,
      perm.chainId,
      perm.poolId,
      perm.tokenA,
      perm.tokenB,
    );

    await expect(
      executor.connect(user).depositAndAddLiquidity(
        permissionId,
        1n,
        await testAdapter.getAddress(),
        await usdc.getAddress(),
        await usdc.getAddress(),
        await weth.getAddress(),
        deposit,
        0n,
        0n,
        1n,
        50n,
      ),
    ).to.be.revertedWithCustomError(executor, "Permit2Required");

    await ethers.provider.send("hardhat_impersonateAccount", [await executor.getAddress()]);
    await ethers.provider.send("hardhat_setBalance", [
      await executor.getAddress(),
      ethers.toQuantity(ethers.parseEther("1")),
    ]);
    const execSigner = await ethers.getSigner(await executor.getAddress());
    await expect(
      feeRouter
        .connect(execSigner)
        .applySwapFee(await usdc.getAddress(), user.address, deposit, permissionId),
    ).to.be.revertedWithCustomError(feeRouter, "Permit2Required");
  });

  it("standalone swap forwards tokenOut delta to user and leaves no executor residue", async function () {
    const ctx = await deployStableClubStack();
    const permissionId = await registerPermission(ctx);
    const gross = ethers.parseUnits("100", 6);
    const dustOut = 5n;

    // Pre-existing WETH dust on executor must remain after swap.
    await ctx.wethContract.mint(ctx.executor, dustOut);

    await approvePermit2Pull(
      ctx.usdcContract,
      ctx.testUser,
      ctx.permit2Contract,
      ctx.feeRouter,
      gross,
    );

    const userWethBefore = await ctx.wethContract.balanceOf(ctx.testUser.address);
    const execUsdcBefore = await ctx.usdcContract.balanceOf(ctx.executor);
    const execWethBefore = await ctx.wethContract.balanceOf(ctx.executor);

    await ctx.executorContract.connect(ctx.testUser).swap(
      permissionId,
      1n,
      ctx.testAdapter,
      ctx.usdc,
      ctx.weth,
      gross,
      1n,
      50n,
    );

    const netOut = (gross * 99n) / 100n; // 1% fee on TestPoolAdapter 1:1
    expect(await ctx.wethContract.balanceOf(ctx.testUser.address)).to.equal(userWethBefore + netOut);
    expect(await ctx.usdcContract.balanceOf(ctx.executor)).to.equal(execUsdcBefore);
    expect(await ctx.wethContract.balanceOf(ctx.executor)).to.equal(execWethBefore);
    expect(await ctx.wethContract.balanceOf(ctx.executor)).to.equal(dustOut);
  });
});
