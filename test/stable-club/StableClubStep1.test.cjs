const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const {
  deployStableClubStack,
  POOL_ID,
  approvePermit2Pull,
} = require("../../scripts/stable-club/deploy-local.cjs");
const { impersonateTimelock } = require("../../scripts/stable-club/governance-activation-local.cjs");

const ALL_ACTIONS =
  (1n << 0n) |
  (1n << 1n) |
  (1n << 2n) |
  (1n << 3n) |
  (1n << 4n) |
  (1n << 6n) |
  (1n << 7n);


async function asOperator(ctx) {
  const executorAddr = ctx.executor;
  if (!(await ctx.permissionRegistryContract.isOperator(executorAddr))) {
    const tlSigner = await impersonateTimelock(ctx.timelockAddr);
    await ctx.permissionRegistryContract.connect(tlSigner).setOperator(executorAddr, true);
  }
  await ethers.provider.send("hardhat_impersonateAccount", [executorAddr]);
  await ethers.provider.send("hardhat_setBalance", [
    executorAddr,
    ethers.toQuantity(ethers.parseEther("1")),
  ]);
  return ctx.permissionRegistryContract.connect(await ethers.getSigner(executorAddr));
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

    await approvePermit2Pull(ctx.usdcContract, ctx.testUser, ctx.permit2Contract, ctx.feeRouter, gross);
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

    await approvePermit2Pull(ctx.usdcContract, ctx.testUser, ctx.permit2Contract, ctx.executor, deposit);
    await approvePermit2Pull(ctx.usdcContract, ctx.testUser, ctx.permit2Contract, ctx.feeRouter, swapPart);

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

    await approvePermit2Pull(ctx.usdcContract, ctx.testUser, ctx.permit2Contract, ctx.executor, deposit * 2n);

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

    await approvePermit2Pull(ctx.usdcContract, ctx.testUser, ctx.permit2Contract, ctx.executor, deposit);
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

    await approvePermit2Pull(ctx.usdcContract, ctx.testUser, ctx.permit2Contract, ctx.executor, deposit);
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

    await approvePermit2Pull(ctx.usdcContract, ctx.testUser, ctx.permit2Contract, ctx.executor, deposit);
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

    await approvePermit2Pull(ctx.usdcContract, ctx.testUser, ctx.permit2Contract, ctx.executor, deposit * 2n);

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
  after(async function () {
    await ethers.provider.send("hardhat_reset", []);
  });

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
    expect(network.chainId).to.equal(31337n);

    const ctx = await deployStableClubStack();
    const permissionId = await registerPermission(ctx);
    const deposit = ethers.parseUnits("200", 6);

    await approvePermit2Pull(ctx.usdcContract, ctx.testUser, ctx.permit2Contract, ctx.executor, deposit);
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

describe("SC-05 — revoked permissions cannot be overwritten", function () {
  async function registrarFixture() {
    const [owner, registrar, stranger, user, operator] = await ethers.getSigners();
    const permissionRegistry = await ethers.deployContract("PermissionRegistry");
    const tokenA = await ethers.deployContract("MockERC20", ["TokenA", "TKA", 18]);
    const tokenB = await ethers.deployContract("MockERC20", ["TokenB", "TKB", 18]);
    await permissionRegistry.setStrategyRegistrar(registrar.address, true);
    await permissionRegistry.setOperator(operator.address, true);
    const chainId = (await ethers.provider.getNetwork()).chainId;
    return {
      owner,
      registrar,
      stranger,
      user,
      operator,
      permissionRegistry,
      tokenAAddr: await tokenA.getAddress(),
      tokenBAddr: await tokenB.getAddress(),
      chainId,
    };
  }

  function basePerm(fx, overrides = {}) {
    return {
      user: fx.user.address,
      chainId: fx.chainId,
      poolId: ethers.id("SC05_POOL"),
      tokenA: fx.tokenAAddr,
      tokenB: fx.tokenBAddr,
      allowedActions: ALL_ACTIONS,
      maxAmountPerTx: 5_000n,
      maxAmountPerDay: 20_000n,
      maxSlippageBps: 500n,
      minTimeBetweenExecutions: 0n,
      maxExecutionsPerDay: 20n,
      expiresAt: BigInt(0), // set by callers via time.latest()
      revoked: false,
      paused: false,
      ...overrides,
    };
  }

  async function snapshotPermission(reg, permissionId) {
    const p = await reg.getPermission(permissionId);
    return {
      user: p.user,
      chainId: p.chainId,
      poolId: p.poolId,
      tokenA: p.tokenA,
      tokenB: p.tokenB,
      allowedActions: p.allowedActions,
      maxAmountPerTx: p.maxAmountPerTx,
      maxAmountPerDay: p.maxAmountPerDay,
      maxSlippageBps: p.maxSlippageBps,
      minTimeBetweenExecutions: p.minTimeBetweenExecutions,
      maxExecutionsPerDay: p.maxExecutionsPerDay,
      expiresAt: p.expiresAt,
      revoked: p.revoked,
      paused: p.paused,
    };
  }

  it("first-time registrar registration succeeds", async function () {
    const fx = await registrarFixture();
    const perm = basePerm(fx, { expiresAt: BigInt((await time.latest()) + 86400) });
    const permissionId = await fx.permissionRegistry.permissionIdFor(
      perm.user,
      perm.chainId,
      perm.poolId,
      perm.tokenA,
      perm.tokenB,
    );
    await expect(
      fx.permissionRegistry.connect(fx.registrar).registerPermissionForStrategyRegistrar(perm),
    )
      .to.emit(fx.permissionRegistry, "PermissionRegistered")
      .withArgs(permissionId, perm.user, perm.poolId);
    const stored = await fx.permissionRegistry.getPermission(permissionId);
    expect(stored.user).to.equal(perm.user);
    expect(stored.revoked).to.equal(false);
  });

  it("user-revoked permission cannot be overwritten or reactivated", async function () {
    const fx = await registrarFixture();
    const perm = basePerm(fx, { expiresAt: BigInt((await time.latest()) + 86400) });
    await fx.permissionRegistry.connect(fx.registrar).registerPermissionForStrategyRegistrar(perm);
    const permissionId = await fx.permissionRegistry.permissionIdFor(
      perm.user,
      perm.chainId,
      perm.poolId,
      perm.tokenA,
      perm.tokenB,
    );
    await fx.permissionRegistry.connect(fx.user).revoke(permissionId);
    expect((await fx.permissionRegistry.getPermission(permissionId)).revoked).to.equal(true);

    const reactivation = {
      ...perm,
      revoked: false,
      maxAmountPerTx: 999_999n,
      expiresAt: BigInt((await time.latest()) + 86400 * 30),
    };
    await expect(
      fx.permissionRegistry.connect(fx.registrar).registerPermissionForStrategyRegistrar(reactivation),
    ).to.be.revertedWithCustomError(fx.permissionRegistry, "PermissionAlreadyExists");
    expect((await fx.permissionRegistry.getPermission(permissionId)).revoked).to.equal(true);
    expect((await fx.permissionRegistry.getPermission(permissionId)).maxAmountPerTx).to.equal(5_000n);
  });

  it("operator-revoked permission cannot be overwritten or reactivated", async function () {
    const fx = await registrarFixture();
    const perm = basePerm(fx, { expiresAt: BigInt((await time.latest()) + 86400) });
    await fx.permissionRegistry.connect(fx.registrar).registerPermissionForStrategyRegistrar(perm);
    const permissionId = await fx.permissionRegistry.permissionIdFor(
      perm.user,
      perm.chainId,
      perm.poolId,
      perm.tokenA,
      perm.tokenB,
    );
    await fx.permissionRegistry.connect(fx.operator).revokeByOperator(permissionId, fx.user.address);
    expect((await fx.permissionRegistry.getPermission(permissionId)).revoked).to.equal(true);

    await expect(
      fx.permissionRegistry.connect(fx.registrar).registerPermissionForStrategyRegistrar({
        ...perm,
        revoked: false,
        maxAmountPerDay: 1n,
      }),
    ).to.be.revertedWithCustomError(fx.permissionRegistry, "PermissionAlreadyExists");
    expect((await fx.permissionRegistry.getPermission(permissionId)).revoked).to.equal(true);
    expect((await fx.permissionRegistry.getPermission(permissionId)).maxAmountPerDay).to.equal(20_000n);
  });

  it("failed overwrite preserves the complete original permission record", async function () {
    const fx = await registrarFixture();
    const perm = basePerm(fx, {
      expiresAt: BigInt((await time.latest()) + 86400),
      maxSlippageBps: 250n,
      minTimeBetweenExecutions: 60n,
      maxExecutionsPerDay: 3n,
      paused: true,
    });
    await fx.permissionRegistry.connect(fx.registrar).registerPermissionForStrategyRegistrar(perm);
    const permissionId = await fx.permissionRegistry.permissionIdFor(
      perm.user,
      perm.chainId,
      perm.poolId,
      perm.tokenA,
      perm.tokenB,
    );
    await fx.permissionRegistry.connect(fx.user).revoke(permissionId);
    const before = await snapshotPermission(fx.permissionRegistry, permissionId);

    // Same permissionId keys — only mutable fields differ (would reactivate if allowed).
    await expect(
      fx.permissionRegistry.connect(fx.registrar).registerPermissionForStrategyRegistrar({
        ...perm,
        allowedActions: 1n,
        maxAmountPerTx: 1n,
        maxAmountPerDay: 1n,
        maxSlippageBps: 1n,
        minTimeBetweenExecutions: 0n,
        maxExecutionsPerDay: 1n,
        expiresAt: BigInt((await time.latest()) + 999999),
        revoked: false,
        paused: false,
      }),
    ).to.be.revertedWithCustomError(fx.permissionRegistry, "PermissionAlreadyExists");

    const after = await snapshotPermission(fx.permissionRegistry, permissionId);
    expect(after).to.deep.equal(before);
  });

  it("emergency validation for the revoked permission remains unchanged", async function () {
    const fx = await registrarFixture();
    const perm = basePerm(fx, { expiresAt: BigInt((await time.latest()) + 86400) });
    await fx.permissionRegistry.connect(fx.registrar).registerPermissionForStrategyRegistrar(perm);
    const permissionId = await fx.permissionRegistry.permissionIdFor(
      perm.user,
      perm.chainId,
      perm.poolId,
      perm.tokenA,
      perm.tokenB,
    );
    await fx.permissionRegistry.connect(fx.user).revoke(permissionId);

    await expect(
      fx.permissionRegistry.connect(fx.operator).validateExecution(permissionId, 0, 1n, 0, 1n),
    ).to.be.revertedWithCustomError(fx.permissionRegistry, "RevokedPermission");

    await fx.permissionRegistry.connect(fx.operator).validateEmergencyExecution(permissionId, 77n);
    await expect(
      fx.permissionRegistry.connect(fx.operator).validateEmergencyExecution(permissionId, 77n),
    ).to.be.revertedWithCustomError(fx.permissionRegistry, "ExecutionNonceAlreadyUsed");
  });

  it("unauthorized registrar behavior remains rejected", async function () {
    const fx = await registrarFixture();
    const perm = basePerm(fx, { expiresAt: BigInt((await time.latest()) + 86400) });
    await expect(
      fx.permissionRegistry.connect(fx.stranger).registerPermissionForStrategyRegistrar(perm),
    ).to.be.revertedWithCustomError(fx.permissionRegistry, "Unauthorized");
  });
});
