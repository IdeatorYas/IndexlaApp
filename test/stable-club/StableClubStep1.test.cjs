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

describe("Stable Club Step 1 — core contracts", function () {
  it("deploys stack with test-only pool adapter", async function () {
    const ctx = await deployStableClubStack();
    expect(await ctx.testAdapterContract.poolId()).to.equal(POOL_ID);
    expect(await ctx.executorContract.approvedAdapters(ctx.testAdapter)).to.equal(true);
  });
});

describe("PermissionRegistry", function () {
  it("registers, enforces caps and revocation", async function () {
    const ctx = await deployStableClubStack();
    const permissionId = await registerPermission(ctx);

    await expect(
      (await asOperator(ctx)).validateExecution(permissionId, 0, ethers.parseUnits("6000", 6), 0, 1n),
    ).to.be.revertedWithCustomError(ctx.permissionRegistryContract, "AmountExceedsTxLimit");

    await ctx.permissionRegistryContract.connect(ctx.testUser).revoke(permissionId);
    await expect(
      (await asOperator(ctx)).validateExecution(permissionId, 0, 1n, 0, 2n),
    ).to.be.revertedWithCustomError(ctx.permissionRegistryContract, "RevokedPermission");
  });

  it("rejects duplicate strategy permission registration", async function () {
    const ctx = await deployStableClubStack();
    await registerPermission(ctx);
    await expect(registerPermission(ctx)).to.be.revertedWithCustomError(
      ctx.permissionRegistryContract,
      "PermissionAlreadyExists",
    );
  });

  it("rejects replayed execution nonces", async function () {
    const ctx = await deployStableClubStack();
    const permissionId = await registerPermission(ctx);

    await (await asOperator(ctx)).validateExecution(permissionId, 0, 1n, 0, 42n);

    await expect(
      (await asOperator(ctx)).validateExecution(permissionId, 0, 1n, 0, 42n),
    ).to.be.revertedWithCustomError(ctx.permissionRegistryContract, "ExecutionNonceAlreadyUsed");
  });

  it("allows repeated executions with unique execution nonces", async function () {
    const ctx = await deployStableClubStack();
    const permissionId = await registerPermission(ctx);

    await (await asOperator(ctx)).validateExecution(permissionId, 0, 1n, 0, 1n);
    await (await asOperator(ctx)).validateExecution(permissionId, 0, 1n, 0, 2n);
  });

  it("rejects expired permissions", async function () {
    const ctx = await deployStableClubStack();
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
      expiresAt: BigInt((await time.latest()) + 120),
      revoked: false,
      paused: false,
    };

    await ctx.permissionRegistryContract.connect(ctx.testUser).registerPermission(perm);
    const permissionId = await ctx.permissionRegistryContract.permissionIdFor(
      perm.user,
      perm.chainId,
      perm.poolId,
      perm.tokenA,
      perm.tokenB,
    );

    await time.increase(121);
    await expect(
      (await asOperator(ctx)).validateExecution(permissionId, 0, 1n, 0, 1n),
    ).to.be.revertedWithCustomError(ctx.permissionRegistryContract, "PermissionExpired");
  });
});

describe("FeeRouter", function () {
  it("charges 1% fee on swap gross and sends net to executor", async function () {
    const ctx = await deployStableClubStack();
    const gross = ethers.parseUnits("1000", 6);
    const fee = gross / 100n;

    await ctx.usdcContract.connect(ctx.testUser).approve(ctx.feeRouter, gross);
    await ethers.provider.send("hardhat_impersonateAccount", [ctx.executor]);
    await ethers.provider.send("hardhat_setBalance", [
      ctx.executor,
      ethers.toQuantity(ethers.parseEther("1")),
    ]);
    const executorSigner = await ethers.getSigner(ctx.executor);

    await ctx.feeRouterContract
      .connect(executorSigner)
      .applySwapFee(ctx.usdc, ctx.testUser.address, gross, ethers.ZeroHash);

    expect(await ctx.usdcContract.balanceOf(ctx.feeRecipient)).to.equal(fee);
    expect(await ctx.usdcContract.balanceOf(ctx.executor)).to.equal(gross - fee);
    expect(await ctx.usdcContract.balanceOf(ctx.feeRouter)).to.equal(0n);
  });
});

describe("StableClubExecutor — test pool flow", function () {
  async function ctxWithPermission() {
    const ctx = await deployStableClubStack();
    const permissionId = await registerPermission(ctx);
    return { ...ctx, permissionId };
  }

  it("deposit with swap → user owns LP; executor retains no funds", async function () {
    const ctx = await ctxWithPermission();
    const deposit = ethers.parseUnits("1000", 6);
    const swapPart = ethers.parseUnits("400", 6);
    const feeBefore = await ctx.usdcContract.balanceOf(ctx.feeRecipient);

    await ctx.usdcContract.connect(ctx.testUser).approve(ctx.executor, deposit);
    await ctx.usdcContract.connect(ctx.testUser).approve(ctx.feeRouter, swapPart);

    await ctx.executorContract.connect(ctx.testUser).depositAndAddLiquidity(
      ctx.permissionId,
      1n,
      ctx.testAdapter,
      ctx.usdc,
      ctx.usdc,
      ctx.weth,
      deposit,
      swapPart,
      (swapPart * 99n) / 100n,
      1n,
      100n,
    );

    expect(await ctx.testAdapterContract.balanceOf(ctx.testUser.address)).to.be.gt(0n);
    expect(await ctx.usdcContract.balanceOf(ctx.executor)).to.equal(0n);
    expect(await ctx.wethContract.balanceOf(ctx.executor)).to.equal(0n);
    expect(await ctx.usdcContract.balanceOf(ctx.feeRecipient)).to.equal(
      feeBefore + swapPart / 100n,
    );
  });

  it("supports multiple deposits on one strategy permission", async function () {
    const ctx = await ctxWithPermission();
    const deposit = ethers.parseUnits("200", 6);

    await ctx.usdcContract.connect(ctx.testUser).approve(ctx.executor, deposit * 2n);

    await ctx.executorContract.connect(ctx.testUser).depositAndAddLiquidity(
      ctx.permissionId,
      10n,
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

    const lpAfterFirst = await ctx.testAdapterContract.balanceOf(ctx.testUser.address);

    await ctx.executorContract.connect(ctx.testUser).depositAndAddLiquidity(
      ctx.permissionId,
      11n,
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

    expect(await ctx.testAdapterContract.balanceOf(ctx.testUser.address)).to.be.gt(lpAfterFirst);
  });

  it("add liquidity without swap charges no INDEXLA fee", async function () {
    const ctx = await ctxWithPermission();
    const deposit = ethers.parseUnits("300", 6);
    const feeBefore = await ctx.usdcContract.balanceOf(ctx.feeRecipient);

    await ctx.usdcContract.connect(ctx.testUser).approve(ctx.executor, deposit);
    await ctx.executorContract.connect(ctx.testUser).depositAndAddLiquidity(
      ctx.permissionId,
      2n,
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

    expect(await ctx.usdcContract.balanceOf(ctx.feeRecipient)).to.equal(feeBefore);
  });

  it("remove, withdraw all, pause, revoke", async function () {
    const ctx = await ctxWithPermission();
    const deposit = ethers.parseUnits("500", 6);

    await ctx.usdcContract.connect(ctx.testUser).approve(ctx.executor, deposit);
    await ctx.executorContract.connect(ctx.testUser).depositAndAddLiquidity(
      ctx.permissionId,
      3n,
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

    const lp = await ctx.testAdapterContract.balanceOf(ctx.testUser.address);
    await ctx.testAdapterContract.connect(ctx.testUser).approve(ctx.executor, lp);

    await ctx.executorContract.connect(ctx.testUser).removeLiquidity(
      ctx.permissionId,
      4n,
      ctx.testAdapter,
      ctx.usdc,
      ctx.weth,
      lp / 2n,
      1n,
      1n,
      50n,
    );

    const remaining = await ctx.testAdapterContract.balanceOf(ctx.testUser.address);
    await ctx.testAdapterContract.connect(ctx.testUser).approve(ctx.executor, remaining);
    await ctx.executorContract.connect(ctx.testUser).withdrawAll(
      ctx.permissionId,
      5n,
      ctx.testAdapter,
      ctx.usdc,
      ctx.weth,
      remaining,
      1n,
      1n,
      50n,
    );

    expect(await ctx.testAdapterContract.balanceOf(ctx.testUser.address)).to.equal(0n);
    await ctx.executorContract.connect(ctx.testUser).pauseAutomation(ctx.permissionId);
    await ctx.executorContract.connect(ctx.testUser).revokePermission(ctx.permissionId);
  });

  it("supports emergency exit without charging a swap fee", async function () {
    const ctx = await ctxWithPermission();
    const deposit = ethers.parseUnits("400", 6);
    const feeBefore = await ctx.usdcContract.balanceOf(ctx.feeRecipient);

    await ctx.usdcContract.connect(ctx.testUser).approve(ctx.executor, deposit);
    await ctx.executorContract.connect(ctx.testUser).depositAndAddLiquidity(
      ctx.permissionId,
      6n,
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

    const lp = await ctx.testAdapterContract.balanceOf(ctx.testUser.address);
    await ctx.testAdapterContract.connect(ctx.testUser).approve(ctx.executor, lp);

    await ctx.executorContract.connect(ctx.testUser).emergencyExit(
      ctx.permissionId,
      7n,
      ctx.testAdapter,
      ctx.usdc,
      ctx.weth,
      lp,
      1n,
      1n,
    );

    expect(await ctx.testAdapterContract.balanceOf(ctx.testUser.address)).to.equal(0n);
    expect(await ctx.usdcContract.balanceOf(ctx.executor)).to.equal(0n);
    expect(await ctx.usdcContract.balanceOf(ctx.feeRecipient)).to.equal(feeBefore);
  });

  it("rejects unauthorized adapter and token", async function () {
    const ctx = await ctxWithPermission();
    const rogue = await ethers.deployContract("MockERC20", ["Rogue", "RG", 18]);

    await expect(
      ctx.executorContract.connect(ctx.testUser).depositAndAddLiquidity(
        ctx.permissionId,
        8n,
        ethers.ZeroAddress,
        ctx.usdc,
        ctx.usdc,
        ctx.weth,
        1n,
        0n,
        0n,
        0n,
        0n,
      ),
    ).to.be.revertedWithCustomError(ctx.executorContract, "AdapterNotApproved");

    await expect(
      ctx.executorContract.connect(ctx.testUser).depositAndAddLiquidity(
        ctx.permissionId,
        9n,
        ctx.testAdapter,
        await rogue.getAddress(),
        await rogue.getAddress(),
        ctx.weth,
        1n,
        0n,
        0n,
        0n,
        0n,
      ),
    ).to.be.revertedWithCustomError(ctx.executorContract, "TokenNotBound");
  });

  it("rejects replayed execution nonce on deposit", async function () {
    const ctx = await ctxWithPermission();
    const deposit = ethers.parseUnits("100", 6);

    await ctx.usdcContract.connect(ctx.testUser).approve(ctx.executor, deposit * 2n);

    await ctx.executorContract.connect(ctx.testUser).depositAndAddLiquidity(
      ctx.permissionId,
      99n,
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

    await expect(
      ctx.executorContract.connect(ctx.testUser).depositAndAddLiquidity(
        ctx.permissionId,
        99n,
        ctx.testAdapter,
        ctx.usdc,
        ctx.usdc,
        ctx.weth,
        deposit,
        0n,
        0n,
        1n,
        50n,
      ),
    ).to.be.revertedWithCustomError(ctx.permissionRegistryContract, "ExecutionNonceAlreadyUsed");
  });
});

describe("Stable Club — Base mainnet fork", function () {
  it("executes test-pool deposit on Base fork when BASE_RPC_URL is configured", async function () {
    if (!process.env.BASE_RPC_URL?.trim()) {
      this.skip();
    }

    await ethers.provider.send("hardhat_reset", [
      {
        forking: {
          jsonRpcUrl: process.env.BASE_RPC_URL,
        },
      },
    ]);

    const network = await ethers.provider.getNetwork();
    expect(network.chainId).to.equal(8453n);

    const ctx = await deployStableClubStack();
    const permissionId = await registerPermission(ctx);
    const deposit = ethers.parseUnits("200", 6);

    await ctx.usdcContract.connect(ctx.testUser).approve(ctx.executor, deposit);
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

    expect(await ctx.testAdapterContract.balanceOf(ctx.testUser.address)).to.be.gt(0n);
    expect(await ctx.usdcContract.balanceOf(ctx.executor)).to.equal(0n);
  });
});
