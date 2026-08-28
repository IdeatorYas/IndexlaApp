const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const {
  deployStableClubStack,
  POOL_ID,
} = require("../../scripts/stable-club/deploy-local.cjs");

const ALL_ACTIONS =
  (1n << 0n) |
  (1n << 1n) |
  (1n << 2n) |
  (1n << 3n) |
  (1n << 4n) |
  (1n << 6n) |
  (1n << 7n);

async function asOperator(ctx) {
  const reg = ctx.permissionRegistryContract;
  const [deployer] = await ethers.getSigners();
  if (!(await reg.isOperator(deployer.address))) {
    await reg.setOperator(deployer.address, true);
  }
  return reg.connect(deployer);
}

async function registerPermission(ctx, overrides = {}) {
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
    ...overrides,
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

function testPoolExitMins(lpAmount) {
  const minA = lpAmount / 2n;
  const minB = lpAmount - minA;
  return { minA: minA > 0n ? minA : 1n, minB: minB > 0n ? minB : 1n };
}

async function depositForUser(ctx, permissionId, executionNonce, deposit = ethers.parseUnits("400", 6)) {
  await ctx.usdcContract.connect(ctx.testUser).approve(ctx.executor, deposit);
  await ctx.executorContract.connect(ctx.testUser).depositAndAddLiquidity(
    permissionId,
    executionNonce,
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
  return ctx.testAdapterContract.balanceOf(ctx.testUser.address);
}

async function emergencyExitDirect(ctx, permissionId, executionNonce, lpAmount) {
  const { minA, minB } = testPoolExitMins(lpAmount);
  await ctx.testAdapterContract.connect(ctx.testUser).approve(ctx.executor, lpAmount);
  await ctx.executorContract.connect(ctx.testUser).emergencyExit(
    permissionId,
    executionNonce,
    ctx.testAdapter,
    ctx.usdc,
    ctx.weth,
    lpAmount,
    minA,
    minB,
  );
}

describe("Stable Club — guaranteed user exit (Phase 1)", function () {
  let ctx;

  beforeEach(async function () {
    ctx = await deployStableClubStack();
  });

  it("1. deposit → user revoke → emergency exit succeeds", async function () {
    const permissionId = await registerPermission(ctx);
    const lp = await depositForUser(ctx, permissionId, 1n);

    await ctx.permissionRegistryContract.connect(ctx.testUser).revoke(permissionId);
    await emergencyExitDirect(ctx, permissionId, 2n, lp);

    expect(await ctx.testAdapterContract.balanceOf(ctx.testUser.address)).to.equal(0n);
    expect(await ctx.usdcContract.balanceOf(ctx.executor)).to.equal(0n);
  });

  it("2. deposit → operator revoke → emergency exit succeeds", async function () {
    const permissionId = await registerPermission(ctx);
    const lp = await depositForUser(ctx, permissionId, 1n);

    await (await asOperator(ctx)).revokeByOperator(permissionId, ctx.testUser.address);
    await emergencyExitDirect(ctx, permissionId, 2n, lp);

    expect(await ctx.testAdapterContract.balanceOf(ctx.testUser.address)).to.equal(0n);
  });

  it("3. deposit → permission expiry → emergency exit succeeds", async function () {
    const expiresAt = BigInt((await time.latest()) + 3600);
    const permissionId = await registerPermission(ctx, { expiresAt });
    const lp = await depositForUser(ctx, permissionId, 1n);

    await time.increaseTo(expiresAt + 1n);
    await emergencyExitDirect(ctx, permissionId, 2n, lp);

    expect(await ctx.testAdapterContract.balanceOf(ctx.testUser.address)).to.equal(0n);
  });

  it("4. paused permission → emergency exit succeeds", async function () {
    const permissionId = await registerPermission(ctx);
    const lp = await depositForUser(ctx, permissionId, 1n);

    await ctx.executorContract.connect(ctx.testUser).pauseAutomation(permissionId);
    await emergencyExitDirect(ctx, permissionId, 2n, lp);

    expect(await ctx.testAdapterContract.balanceOf(ctx.testUser.address)).to.equal(0n);
  });

  it("5. attacker cannot emergency-exit another user's position", async function () {
    const permissionId = await registerPermission(ctx);
    const lp = await depositForUser(ctx, permissionId, 1n);
    const { minA, minB } = testPoolExitMins(lp);

    const [, , attacker] = await ethers.getSigners();
    await ctx.testAdapterContract.connect(ctx.testUser).approve(ctx.executor, lp);

    await expect(
      ctx.executorContract.connect(attacker).emergencyExit(
        permissionId,
        2n,
        ctx.testAdapter,
        ctx.usdc,
        ctx.weth,
        lp,
        minA,
        minB,
      ),
    ).to.be.revertedWithCustomError(ctx.permissionRegistryContract, "UnauthorizedUser");
  });

  it("6. wrong adapter/pool reverts emergency exit", async function () {
    const permissionId = await registerPermission(ctx);
    const lp = await depositForUser(ctx, permissionId, 1n);
    const { minA, minB } = testPoolExitMins(lp);

    const otherPool = ethers.id("OTHER_GUARANTEED_EXIT_POOL");
    const otherAdapter = await ethers.deployContract("ConfigurableTestPoolAdapter", [
      ctx.executor,
      otherPool,
    ]);
    await ctx.executorContract.setAdapterApproval(await otherAdapter.getAddress(), true);
    await ctx.executorContract.registerPool(otherPool, await otherAdapter.getAddress(), true);

    await ctx.testAdapterContract.connect(ctx.testUser).approve(ctx.executor, lp);

    await expect(
      ctx.executorContract.connect(ctx.testUser).emergencyExit(
        permissionId,
        2n,
        await otherAdapter.getAddress(),
        ctx.usdc,
        ctx.weth,
        lp,
        minA,
        minB,
      ),
    ).to.be.revertedWithCustomError(ctx.executorContract, "PoolMismatch");
  });

  it("7. replayed emergency call reverts", async function () {
    const permissionId = await registerPermission(ctx);
    const lp = await depositForUser(ctx, permissionId, 1n);
    const { minA, minB } = testPoolExitMins(lp);

    await emergencyExitDirect(ctx, permissionId, 2n, lp);

    const lp2 = await depositForUser(ctx, permissionId, 3n, ethers.parseUnits("100", 6));
    await ctx.testAdapterContract.connect(ctx.testUser).approve(ctx.executor, lp2);

    await expect(
      ctx.executorContract.connect(ctx.testUser).emergencyExit(
        permissionId,
        2n,
        ctx.testAdapter,
        ctx.usdc,
        ctx.weth,
        lp2,
        minA,
        minB,
      ),
    ).to.be.revertedWithCustomError(ctx.permissionRegistryContract, "ExecutionNonceAlreadyUsed");
  });

  it("8. direct contract exit without registry/UI (wallet-only path)", async function () {
    const permissionId = await registerPermission(ctx);
    const lp = await depositForUser(ctx, permissionId, 1n);

    await ctx.permissionRegistryContract.connect(ctx.testUser).revoke(permissionId);
    await emergencyExitDirect(ctx, permissionId, 2n, lp);

    const usdcAfter = await ctx.usdcContract.balanceOf(ctx.testUser.address);
    expect(usdcAfter).to.be.gt(0n);
  });

  it("9. normal operations remain blocked after revoke/expiry", async function () {
    const expiresAt = BigInt((await time.latest()) + 3600);
    const permissionId = await registerPermission(ctx, { expiresAt });
    await depositForUser(ctx, permissionId, 1n);

    await ctx.permissionRegistryContract.connect(ctx.testUser).revoke(permissionId);

    await expect(
      ctx.executorContract.connect(ctx.testUser).depositAndAddLiquidity(
        permissionId,
        2n,
        ctx.testAdapter,
        ctx.usdc,
        ctx.usdc,
        ctx.weth,
        ethers.parseUnits("50", 6),
        0n,
        0n,
        1n,
        50n,
      ),
    ).to.be.revertedWithCustomError(ctx.permissionRegistryContract, "RevokedPermission");

    await time.increaseTo(expiresAt + 1n);

    await expect(
      (await asOperator(ctx)).validateExecution(permissionId, 0, 1n, 0, 3n),
    ).to.be.revertedWithCustomError(ctx.permissionRegistryContract, "RevokedPermission");
  });

  it("rejects emergency exit with zero minOut", async function () {
    const permissionId = await registerPermission(ctx);
    const lp = await depositForUser(ctx, permissionId, 1n);

    await ctx.testAdapterContract.connect(ctx.testUser).approve(ctx.executor, lp);

    await expect(
      ctx.executorContract.connect(ctx.testUser).emergencyExit(
        permissionId,
        2n,
        ctx.testAdapter,
        ctx.usdc,
        ctx.weth,
        lp,
        0n,
        0n,
      ),
    ).to.be.revertedWithCustomError(ctx.executorContract, "MinOutRequired");
  });
});
