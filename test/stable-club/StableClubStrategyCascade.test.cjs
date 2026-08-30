/**
 * SC-04 — strategy kill-switch cascades to bound leg permissions.
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const {
  deployPhase2aLocalStack,
} = require("../../scripts/stable-club/deploy-phase2a-local.cjs");

const ALL_ACTIONS =
  (1n << 0n) | (1n << 1n) | (1n << 2n) | (1n << 3n) | (1n << 4n) | (1n << 6n) | (1n << 7n);

async function fixture() {
  const stack = await deployPhase2aLocalStack();
  const [deployer, , , stranger] = await ethers.getSigners();
  // Deployer as PermissionRegistry operator for direct validateExecution probes.
  await stack.contracts.permissionRegistry.setOperator(deployer.address, true);
  return {
    deployer,
    stranger,
    user: stack.contracts.testUser,
    permissionRegistry: stack.contracts.permissionRegistry,
    strategyRegistry: stack.contracts.strategyRegistry,
    adapters: stack.adapters,
    tokens: { usdc: stack.usdc, cbbtc: stack.cbbtc, weth: stack.weth },
    chainId: BigInt(stack.chainId),
    poolIds: stack.poolIds,
  };
}

async function registerStrategy(ctx) {
  const expiresAt = BigInt((await time.latest()) + 86400 * 7);
  const strategy = {
    user: ctx.user.address,
    chainId: ctx.chainId,
    depositToken: ctx.tokens.usdc,
    allowedActions: ALL_ACTIONS,
    maxTotalPerTx: ethers.parseUnits("10000", 6),
    maxTotalPerDay: ethers.parseUnits("50000", 6),
    maxSlippageBps: 500n,
    minTimeBetweenExecutions: 0n,
    maxExecutionsPerDay: 50n,
    expiresAt,
    revoked: false,
    paused: false,
  };
  const legPermissions = [];
  const legs = [];
  for (let i = 0; i < 5; i++) {
    const adapter = ctx.adapters[i];
    const legPerm = {
      user: ctx.user.address,
      chainId: ctx.chainId,
      poolId: adapter.poolId,
      tokenA: adapter.tokenA,
      tokenB: adapter.tokenB,
      allowedActions: ALL_ACTIONS,
      maxAmountPerTx: ethers.parseUnits("2000", 6),
      maxAmountPerDay: ethers.parseUnits("10000", 6),
      maxSlippageBps: 500n,
      minTimeBetweenExecutions: 0n,
      maxExecutionsPerDay: 50n,
      expiresAt,
      revoked: false,
      paused: false,
    };
    const legPermissionId = await ctx.permissionRegistry.permissionIdFor(
      legPerm.user,
      legPerm.chainId,
      legPerm.poolId,
      legPerm.tokenA,
      legPerm.tokenB,
    );
    legPermissions.push(legPerm);
    legs.push({
      poolId: adapter.poolId,
      allocationBps: 2000n,
      adapter: adapter.adapter,
      tokenA: adapter.tokenA,
      tokenB: adapter.tokenB,
      legPermissionId,
      maxLegPerTx: ethers.parseUnits("2000", 6),
      maxLegPerDay: ethers.parseUnits("10000", 6),
    });
  }
  await ctx.strategyRegistry.connect(ctx.user).registerFivePoolStrategy(strategy, legPermissions, legs);
  const strategyId = await ctx.strategyRegistry.strategyIdFor(
    ctx.user.address,
    ctx.chainId,
    ctx.tokens.usdc,
  );
  const legIds = [];
  for (let i = 0; i < 5; i++) {
    const leg = await ctx.strategyRegistry.getLeg(strategyId, i);
    legIds.push(leg.legPermissionId);
  }
  return { strategyId, legIds };
}

async function expectAllLegsRevoked(ctx, legIds) {
  for (const id of legIds) {
    expect((await ctx.permissionRegistry.getPermission(id)).revoked).to.equal(true);
  }
}

describe("SC-04 — cascade strategy kill switch to leg permissions", function () {
  it("strategy revoke cascades to all five leg permissions", async function () {
    const ctx = await fixture();
    const { strategyId, legIds } = await registerStrategy(ctx);
    await ctx.strategyRegistry.connect(ctx.user).revokeStrategy(strategyId);
    expect((await ctx.strategyRegistry.getStrategy(strategyId)).revoked).to.equal(true);
    await expectAllLegsRevoked(ctx, legIds);
  });

  it("direct leg execution fails after strategy revoke", async function () {
    const ctx = await fixture();
    const { strategyId, legIds } = await registerStrategy(ctx);
    await ctx.strategyRegistry.connect(ctx.user).revokeStrategy(strategyId);
    for (let i = 0; i < 5; i++) {
      await expect(
        ctx.permissionRegistry.connect(ctx.deployer).validateExecution(legIds[i], 0, 1n, 0, BigInt(100 + i)),
      ).to.be.revertedWithCustomError(ctx.permissionRegistry, "RevokedPermission");
    }
  });

  it("emergency validation succeeds after strategy revoke", async function () {
    const ctx = await fixture();
    const { strategyId, legIds } = await registerStrategy(ctx);
    await ctx.strategyRegistry.connect(ctx.user).revokeStrategy(strategyId);
    for (let i = 0; i < 5; i++) {
      await ctx.permissionRegistry
        .connect(ctx.deployer)
        .validateEmergencyExecution(legIds[i], BigInt(200 + i));
    }
  });

  it("strategy pause cascades to all five leg permissions", async function () {
    const ctx = await fixture();
    const { strategyId, legIds } = await registerStrategy(ctx);
    await ctx.strategyRegistry.connect(ctx.user).pauseStrategy(strategyId);
    expect((await ctx.strategyRegistry.getStrategy(strategyId)).paused).to.equal(true);
    for (const id of legIds) {
      expect(await ctx.permissionRegistry.isStrategyCascadePaused(id)).to.equal(true);
      expect((await ctx.permissionRegistry.getPermission(id)).paused).to.equal(false);
      expect((await ctx.permissionRegistry.getPermission(id)).revoked).to.equal(false);
    }
  });

  it("direct leg execution fails while strategy-paused", async function () {
    const ctx = await fixture();
    const { strategyId, legIds } = await registerStrategy(ctx);
    await ctx.strategyRegistry.connect(ctx.user).pauseStrategy(strategyId);
    for (let i = 0; i < 5; i++) {
      await expect(
        ctx.permissionRegistry.connect(ctx.deployer).validateExecution(legIds[i], 0, 1n, 0, BigInt(300 + i)),
      ).to.be.revertedWithCustomError(ctx.permissionRegistry, "PausedPermission");
    }
  });

  it("emergency validation succeeds while strategy-paused", async function () {
    const ctx = await fixture();
    const { strategyId, legIds } = await registerStrategy(ctx);
    await ctx.strategyRegistry.connect(ctx.user).pauseStrategy(strategyId);
    for (let i = 0; i < 5; i++) {
      await ctx.permissionRegistry
        .connect(ctx.deployer)
        .validateEmergencyExecution(legIds[i], BigInt(400 + i));
    }
  });

  it("strategy unpause restores only strategy-paused legs", async function () {
    const ctx = await fixture();
    const { strategyId, legIds } = await registerStrategy(ctx);
    await ctx.strategyRegistry.connect(ctx.user).pauseStrategy(strategyId);
    await ctx.strategyRegistry.connect(ctx.user).unpauseStrategy(strategyId);
    expect((await ctx.strategyRegistry.getStrategy(strategyId)).paused).to.equal(false);
    for (const id of legIds) {
      expect(await ctx.permissionRegistry.isStrategyCascadePaused(id)).to.equal(false);
      expect((await ctx.permissionRegistry.getPermission(id)).paused).to.equal(false);
    }
    // Legs are executable again after strategy unpause.
    await ctx.permissionRegistry.connect(ctx.deployer).validateExecution(legIds[0], 0, 1n, 0, 501n);
  });

  it("independently paused leg remains paused after strategy unpause", async function () {
    const ctx = await fixture();
    const { strategyId, legIds } = await registerStrategy(ctx);
    await ctx.permissionRegistry.connect(ctx.user).pause(legIds[2]);
    expect((await ctx.permissionRegistry.getPermission(legIds[2])).paused).to.equal(true);

    await ctx.strategyRegistry.connect(ctx.user).pauseStrategy(strategyId);
    await ctx.strategyRegistry.connect(ctx.user).unpauseStrategy(strategyId);

    expect(await ctx.permissionRegistry.isStrategyCascadePaused(legIds[2])).to.equal(false);
    expect((await ctx.permissionRegistry.getPermission(legIds[2])).paused).to.equal(true);
    await expect(
      ctx.permissionRegistry.connect(ctx.deployer).validateExecution(legIds[2], 0, 1n, 0, 601n),
    ).to.be.revertedWithCustomError(ctx.permissionRegistry, "PausedPermission");

    // Other legs recovered.
    await ctx.permissionRegistry.connect(ctx.deployer).validateExecution(legIds[0], 0, 1n, 0, 602n);
  });

  it("cross-strategy permission mutation is impossible", async function () {
    const ctx = await fixture();
    const { strategyId, legIds } = await registerStrategy(ctx);

    // Stranger cannot revoke/pause strategy.
    await expect(
      ctx.strategyRegistry.connect(ctx.stranger).revokeStrategy(strategyId),
    ).to.be.revertedWithCustomError(ctx.strategyRegistry, "UnauthorizedUser");
    await expect(
      ctx.strategyRegistry.connect(ctx.stranger).pauseStrategy(strategyId),
    ).to.be.revertedWithCustomError(ctx.strategyRegistry, "UnauthorizedUser");

    // Direct cascade entrypoints reject non-registrar callers.
    await expect(
      ctx.permissionRegistry
        .connect(ctx.stranger)
        .revokeFromStrategyRegistrar(legIds[0], ctx.user.address, strategyId),
    ).to.be.revertedWithCustomError(ctx.permissionRegistry, "Unauthorized");
    await expect(
      ctx.permissionRegistry
        .connect(ctx.deployer)
        .pauseFromStrategyRegistrar(legIds[0], ctx.user.address, strategyId),
    ).to.be.revertedWithCustomError(ctx.permissionRegistry, "Unauthorized");

    // Wrong-user cascade from impersonated registrar still fails integrity check.
    const regAddr = await ctx.strategyRegistry.getAddress();
    await ethers.provider.send("hardhat_impersonateAccount", [regAddr]);
    await ethers.provider.send("hardhat_setBalance", [regAddr, "0x56BC75E2D63100000"]);
    const regSigner = await ethers.getSigner(regAddr);
    await expect(
      ctx.permissionRegistry
        .connect(regSigner)
        .revokeFromStrategyRegistrar(legIds[0], ctx.stranger.address, strategyId),
    ).to.be.revertedWithCustomError(ctx.permissionRegistry, "UnauthorizedUser");

    // Original legs untouched.
    for (const id of legIds) {
      expect((await ctx.permissionRegistry.getPermission(id)).revoked).to.equal(false);
    }
  });

  it("failed leg cascade rolls back the complete strategy change", async function () {
    const ctx = await fixture();
    const { strategyId, legIds } = await registerStrategy(ctx);

    // Drop registrar ACL so cascade reverts on first leg.
    await ctx.permissionRegistry.setStrategyRegistrar(await ctx.strategyRegistry.getAddress(), false);

    await expect(
      ctx.strategyRegistry.connect(ctx.user).revokeStrategy(strategyId),
    ).to.be.revertedWithCustomError(ctx.permissionRegistry, "Unauthorized");

    expect((await ctx.strategyRegistry.getStrategy(strategyId)).revoked).to.equal(false);
    for (const id of legIds) {
      expect((await ctx.permissionRegistry.getPermission(id)).revoked).to.equal(false);
    }

    await expect(
      ctx.strategyRegistry.connect(ctx.user).pauseStrategy(strategyId),
    ).to.be.revertedWithCustomError(ctx.permissionRegistry, "Unauthorized");
    expect((await ctx.strategyRegistry.getStrategy(strategyId)).paused).to.equal(false);
    for (const id of legIds) {
      expect(await ctx.permissionRegistry.isStrategyCascadePaused(id)).to.equal(false);
    }
  });

  it("revoked strategy ID cannot be re-registered", async function () {
    const ctx = await fixture();
    const { strategyId } = await registerStrategy(ctx);
    await ctx.strategyRegistry.connect(ctx.user).revokeStrategy(strategyId);

    const expiresAt = BigInt((await time.latest()) + 86400 * 7);
    const strategy = {
      user: ctx.user.address,
      chainId: ctx.chainId,
      depositToken: ctx.tokens.usdc,
      allowedActions: ALL_ACTIONS,
      maxTotalPerTx: ethers.parseUnits("10000", 6),
      maxTotalPerDay: ethers.parseUnits("50000", 6),
      maxSlippageBps: 500n,
      minTimeBetweenExecutions: 0n,
      maxExecutionsPerDay: 50n,
      expiresAt,
      revoked: false,
      paused: false,
    };
    // Build fresh leg payloads (same IDs) — strategy layer must reject before permission recycle.
    const legPermissions = [];
    const legs = [];
    for (let i = 0; i < 5; i++) {
      const adapter = ctx.adapters[i];
      const legPerm = {
        user: ctx.user.address,
        chainId: ctx.chainId,
        poolId: adapter.poolId,
        tokenA: adapter.tokenA,
        tokenB: adapter.tokenB,
        allowedActions: ALL_ACTIONS,
        maxAmountPerTx: ethers.parseUnits("2000", 6),
        maxAmountPerDay: ethers.parseUnits("10000", 6),
        maxSlippageBps: 500n,
        minTimeBetweenExecutions: 0n,
        maxExecutionsPerDay: 50n,
        expiresAt,
        revoked: false,
        paused: false,
      };
      const legPermissionId = await ctx.permissionRegistry.permissionIdFor(
        legPerm.user,
        legPerm.chainId,
        legPerm.poolId,
        legPerm.tokenA,
        legPerm.tokenB,
      );
      legPermissions.push(legPerm);
      legs.push({
        poolId: adapter.poolId,
        allocationBps: 2000n,
        adapter: adapter.adapter,
        tokenA: adapter.tokenA,
        tokenB: adapter.tokenB,
        legPermissionId,
        maxLegPerTx: ethers.parseUnits("2000", 6),
        maxLegPerDay: ethers.parseUnits("10000", 6),
      });
    }
    await expect(
      ctx.strategyRegistry.connect(ctx.user).registerFivePoolStrategy(strategy, legPermissions, legs),
    ).to.be.revertedWithCustomError(ctx.strategyRegistry, "StrategyAlreadyExists");
    expect((await ctx.strategyRegistry.getStrategy(strategyId)).revoked).to.equal(true);
  });

  it("duplicate leg permission ID in one strategy is rejected", async function () {
    const ctx = await fixture();
    const expiresAt = BigInt((await time.latest()) + 86400 * 7);
    const strategy = {
      user: ctx.user.address,
      chainId: ctx.chainId,
      depositToken: ctx.tokens.usdc,
      allowedActions: ALL_ACTIONS,
      maxTotalPerTx: ethers.parseUnits("10000", 6),
      maxTotalPerDay: ethers.parseUnits("50000", 6),
      maxSlippageBps: 500n,
      minTimeBetweenExecutions: 0n,
      maxExecutionsPerDay: 50n,
      expiresAt,
      revoked: false,
      paused: false,
    };
    const legPermissions = [];
    const legs = [];
    for (let i = 0; i < 5; i++) {
      const adapter = ctx.adapters[i === 1 ? 0 : i]; // leg 1 reuses leg 0 pool/tokens → same permission ID
      const legPerm = {
        user: ctx.user.address,
        chainId: ctx.chainId,
        poolId: adapter.poolId,
        tokenA: adapter.tokenA,
        tokenB: adapter.tokenB,
        allowedActions: ALL_ACTIONS,
        maxAmountPerTx: ethers.parseUnits("2000", 6),
        maxAmountPerDay: ethers.parseUnits("10000", 6),
        maxSlippageBps: 500n,
        minTimeBetweenExecutions: 0n,
        maxExecutionsPerDay: 50n,
        expiresAt,
        revoked: false,
        paused: false,
      };
      const legPermissionId = await ctx.permissionRegistry.permissionIdFor(
        legPerm.user,
        legPerm.chainId,
        legPerm.poolId,
        legPerm.tokenA,
        legPerm.tokenB,
      );
      legPermissions.push(legPerm);
      legs.push({
        poolId: adapter.poolId,
        allocationBps: 2000n,
        adapter: ctx.adapters[i].adapter, // adapter slot still unique
        tokenA: adapter.tokenA,
        tokenB: adapter.tokenB,
        legPermissionId,
        maxLegPerTx: ethers.parseUnits("2000", 6),
        maxLegPerDay: ethers.parseUnits("10000", 6),
      });
    }
    await expect(
      ctx.strategyRegistry.connect(ctx.user).registerFivePoolStrategy(strategy, legPermissions, legs),
    ).to.be.revertedWithCustomError(ctx.strategyRegistry, "LegPermissionDuplicate");
  });

  it("same user cannot reuse a leg permission ID across strategies", async function () {
    const ctx = await fixture();
    const { strategyId, legIds } = await registerStrategy(ctx);

    // Second registry (different strategyKind) shares PermissionRegistry + same pools.
    const otherKind = ethers.id("STABLE_CLUB_FIVE_POOL_OTHER");
    const otherStrategy = await ethers.deployContract("StrategyPermissionRegistry", [
      await ctx.permissionRegistry.getAddress(),
      otherKind,
      ctx.tokens.usdc,
    ]);
    await ctx.permissionRegistry.setStrategyRegistrar(await otherStrategy.getAddress(), true);

    const expiresAt = BigInt((await time.latest()) + 86400 * 7);
    const strategy = {
      user: ctx.user.address,
      chainId: ctx.chainId,
      depositToken: ctx.tokens.usdc,
      allowedActions: ALL_ACTIONS,
      maxTotalPerTx: ethers.parseUnits("10000", 6),
      maxTotalPerDay: ethers.parseUnits("50000", 6),
      maxSlippageBps: 500n,
      minTimeBetweenExecutions: 0n,
      maxExecutionsPerDay: 50n,
      expiresAt,
      revoked: false,
      paused: false,
    };
    const legPermissions = [];
    const legs = [];
    for (let i = 0; i < 5; i++) {
      const adapter = ctx.adapters[i];
      const legPerm = {
        user: ctx.user.address,
        chainId: ctx.chainId,
        poolId: adapter.poolId,
        tokenA: adapter.tokenA,
        tokenB: adapter.tokenB,
        allowedActions: ALL_ACTIONS,
        maxAmountPerTx: ethers.parseUnits("2000", 6),
        maxAmountPerDay: ethers.parseUnits("10000", 6),
        maxSlippageBps: 500n,
        minTimeBetweenExecutions: 0n,
        maxExecutionsPerDay: 50n,
        expiresAt,
        revoked: false,
        paused: false,
      };
      legPermissions.push(legPerm);
      legs.push({
        poolId: adapter.poolId,
        allocationBps: 2000n,
        adapter: adapter.adapter,
        tokenA: adapter.tokenA,
        tokenB: adapter.tokenB,
        legPermissionId: legIds[i],
        maxLegPerTx: ethers.parseUnits("2000", 6),
        maxLegPerDay: ethers.parseUnits("10000", 6),
      });
    }
    await expect(
      otherStrategy.connect(ctx.user).registerFivePoolStrategy(strategy, legPermissions, legs),
    ).to.be.revertedWithCustomError(otherStrategy, "LegPermissionAlreadyBound");
    expect(await ctx.permissionRegistry.permissionStrategyId(legIds[0])).to.equal(strategyId);
  });

  it("different user cannot reuse a bound leg permission ID", async function () {
    const ctx = await fixture();
    const { legIds } = await registerStrategy(ctx);
    const expiresAt = BigInt((await time.latest()) + 86400 * 7);
    const strategy = {
      user: ctx.stranger.address,
      chainId: ctx.chainId,
      depositToken: ctx.tokens.usdc,
      allowedActions: ALL_ACTIONS,
      maxTotalPerTx: ethers.parseUnits("10000", 6),
      maxTotalPerDay: ethers.parseUnits("50000", 6),
      maxSlippageBps: 500n,
      minTimeBetweenExecutions: 0n,
      maxExecutionsPerDay: 50n,
      expiresAt,
      revoked: false,
      paused: false,
    };
    // Stranger strategy payload but injects user A's already-bound permission IDs.
    const legPermissions = [];
    const legs = [];
    for (let i = 0; i < 5; i++) {
      const adapter = ctx.adapters[i];
      const legPerm = {
        user: ctx.stranger.address,
        chainId: ctx.chainId,
        poolId: adapter.poolId,
        tokenA: adapter.tokenA,
        tokenB: adapter.tokenB,
        allowedActions: ALL_ACTIONS,
        maxAmountPerTx: ethers.parseUnits("2000", 6),
        maxAmountPerDay: ethers.parseUnits("10000", 6),
        maxSlippageBps: 500n,
        minTimeBetweenExecutions: 0n,
        maxExecutionsPerDay: 50n,
        expiresAt,
        revoked: false,
        paused: false,
      };
      const strangerLegId = await ctx.permissionRegistry.permissionIdFor(
        legPerm.user,
        legPerm.chainId,
        legPerm.poolId,
        legPerm.tokenA,
        legPerm.tokenB,
      );
      legPermissions.push(legPerm);
      legs.push({
        poolId: adapter.poolId,
        allocationBps: 2000n,
        adapter: adapter.adapter,
        tokenA: adapter.tokenA,
        tokenB: adapter.tokenB,
        // Mismatch: claim user A's bound ID while perm derives stranger's ID.
        legPermissionId: legIds[i],
        maxLegPerTx: ethers.parseUnits("2000", 6),
        maxLegPerDay: ethers.parseUnits("10000", 6),
      });
      expect(strangerLegId).to.not.equal(legIds[i]);
    }
    await expect(
      ctx.strategyRegistry.connect(ctx.stranger).registerFivePoolStrategy(strategy, legPermissions, legs),
    ).to.be.revertedWithCustomError(ctx.strategyRegistry, "LegPoolMismatch");
  });

  it("cascade cannot mutate a permission whose strategy binding does not match", async function () {
    const ctx = await fixture();
    const { strategyId, legIds } = await registerStrategy(ctx);
    const wrongStrategyId = ethers.id("NOT_THE_BOUND_STRATEGY");

    const regAddr = await ctx.strategyRegistry.getAddress();
    await ethers.provider.send("hardhat_impersonateAccount", [regAddr]);
    await ethers.provider.send("hardhat_setBalance", [regAddr, "0x56BC75E2D63100000"]);
    const regSigner = await ethers.getSigner(regAddr);

    await expect(
      ctx.permissionRegistry
        .connect(regSigner)
        .revokeFromStrategyRegistrar(legIds[0], ctx.user.address, wrongStrategyId),
    ).to.be.revertedWithCustomError(ctx.permissionRegistry, "PermissionStrategyMismatch");
    await expect(
      ctx.permissionRegistry
        .connect(regSigner)
        .pauseFromStrategyRegistrar(legIds[0], ctx.user.address, wrongStrategyId),
    ).to.be.revertedWithCustomError(ctx.permissionRegistry, "PermissionStrategyMismatch");
    await expect(
      ctx.permissionRegistry
        .connect(regSigner)
        .unpauseFromStrategyRegistrar(legIds[0], ctx.user.address, wrongStrategyId),
    ).to.be.revertedWithCustomError(ctx.permissionRegistry, "PermissionStrategyMismatch");

    expect((await ctx.permissionRegistry.getPermission(legIds[0])).revoked).to.equal(false);
    expect(await ctx.permissionRegistry.isStrategyCascadePaused(legIds[0])).to.equal(false);
    expect(await ctx.permissionRegistry.permissionStrategyId(legIds[0])).to.equal(strategyId);
  });
});
