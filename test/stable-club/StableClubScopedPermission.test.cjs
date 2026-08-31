const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const {
  deployStableClubStack,
  POOL_ID,
} = require("../../scripts/stable-club/deploy-local.cjs");

const HARVEST_BIT = 1n << 8n;
const COMPOUND_BIT = 1n << 9n;
const PAUSE_BIT = 1n << 5n;
const REVOKE_BIT = 1n << 6n;
const EMERGENCY_BIT = 1n << 7n;

const SCOPE_COMPOUND = ethers.keccak256(
  ethers.toUtf8Bytes("INDEXLA_PERMISSION_SCOPE_COMPOUND"),
);
const SCOPE_OTHER = ethers.keccak256(
  ethers.toUtf8Bytes("INDEXLA_PERMISSION_SCOPE_OTHER"),
);

function basePerm(ctx, overrides = {}) {
  return {
    user: ctx.testUser.address,
    chainId: ctx.chainId,
    poolId: POOL_ID,
    tokenA: ctx.usdc,
    tokenB: ctx.weth,
    allowedActions: HARVEST_BIT | PAUSE_BIT | REVOKE_BIT | EMERGENCY_BIT,
    maxAmountPerTx: 0n,
    maxAmountPerDay: 0n,
    maxSlippageBps: 0n,
    minTimeBetweenExecutions: 0n,
    maxExecutionsPerDay: 50n,
    expiresAt: 0n,
    revoked: false,
    paused: false,
    ...overrides,
  };
}

describe("PermissionRegistry — scoped harvest+compound coexistence", function () {
  async function setup() {
    const ctx = await deployStableClubStack();
    const network = await ethers.provider.getNetwork();
    ctx.chainId = network.chainId;
    ctx.expiresAt = BigInt((await time.latest()) + 86400 * 30);
    return ctx;
  }

  it("legacy harvest and scoped compound coexist for same user/pool/tokens", async function () {
    const ctx = await setup();
    const reg = ctx.permissionRegistryContract;

    const harvestPerm = basePerm(ctx, {
      allowedActions: HARVEST_BIT | PAUSE_BIT | REVOKE_BIT | EMERGENCY_BIT,
      expiresAt: ctx.expiresAt,
    });
    await reg.connect(ctx.testUser).registerPermission(harvestPerm);
    const harvestId = await reg.permissionIdFor(
      harvestPerm.user,
      harvestPerm.chainId,
      harvestPerm.poolId,
      harvestPerm.tokenA,
      harvestPerm.tokenB,
    );

    const compoundPerm = basePerm(ctx, {
      allowedActions: COMPOUND_BIT | PAUSE_BIT | REVOKE_BIT | EMERGENCY_BIT,
      maxAmountPerTx: ethers.parseUnits("5000", 6),
      maxAmountPerDay: ethers.parseUnits("20000", 6),
      maxSlippageBps: 500n,
      expiresAt: ctx.expiresAt,
    });
    await reg.connect(ctx.testUser).registerScopedPermission(compoundPerm, SCOPE_COMPOUND);
    const compoundId = await reg.permissionIdForScoped(
      compoundPerm.user,
      compoundPerm.chainId,
      compoundPerm.poolId,
      compoundPerm.tokenA,
      compoundPerm.tokenB,
      SCOPE_COMPOUND,
    );

    expect(harvestId).to.not.equal(compoundId);

    const h = await reg.getPermission(harvestId);
    const c = await reg.getPermission(compoundId);
    expect(h.user).to.equal(ctx.testUser.address);
    expect(c.user).to.equal(ctx.testUser.address);
    expect(h.revoked).to.equal(false);
    expect(c.revoked).to.equal(false);
    expect(h.allowedActions & HARVEST_BIT).to.equal(HARVEST_BIT);
    expect(c.allowedActions & COMPOUND_BIT).to.equal(COMPOUND_BIT);
  });

  it("scoped id never equals legacy id (collision prevention)", async function () {
    const ctx = await setup();
    const reg = ctx.permissionRegistryContract;
    const legacy = await reg.permissionIdFor(
      ctx.testUser.address,
      ctx.chainId,
      POOL_ID,
      ctx.usdc,
      ctx.weth,
    );
    const scoped0 = await reg.permissionIdForScoped(
      ctx.testUser.address,
      ctx.chainId,
      POOL_ID,
      ctx.usdc,
      ctx.weth,
      ethers.ZeroHash,
    );
    const scopedC = await reg.permissionIdForScoped(
      ctx.testUser.address,
      ctx.chainId,
      POOL_ID,
      ctx.usdc,
      ctx.weth,
      SCOPE_COMPOUND,
    );
    expect(scoped0).to.not.equal(legacy);
    expect(scopedC).to.not.equal(legacy);
    expect(scopedC).to.not.equal(scoped0);
  });

  it("independent revoke: harvest revoke leaves compound active", async function () {
    const ctx = await setup();
    const reg = ctx.permissionRegistryContract;

    await reg.connect(ctx.testUser).registerPermission(
      basePerm(ctx, { expiresAt: ctx.expiresAt }),
    );
    const harvestId = await reg.permissionIdFor(
      ctx.testUser.address,
      ctx.chainId,
      POOL_ID,
      ctx.usdc,
      ctx.weth,
    );

    await reg.connect(ctx.testUser).registerScopedPermission(
      basePerm(ctx, {
        allowedActions: COMPOUND_BIT | PAUSE_BIT | REVOKE_BIT | EMERGENCY_BIT,
        maxAmountPerTx: ethers.parseUnits("1000", 6),
        maxAmountPerDay: ethers.parseUnits("5000", 6),
        maxSlippageBps: 500n,
        expiresAt: ctx.expiresAt,
      }),
      SCOPE_COMPOUND,
    );
    const compoundId = await reg.permissionIdForScoped(
      ctx.testUser.address,
      ctx.chainId,
      POOL_ID,
      ctx.usdc,
      ctx.weth,
      SCOPE_COMPOUND,
    );

    await reg.connect(ctx.testUser).revoke(harvestId);
    expect((await reg.getPermission(harvestId)).revoked).to.equal(true);
    expect((await reg.getPermission(compoundId)).revoked).to.equal(false);

    await reg.connect(ctx.testUser).pause(compoundId);
    expect((await reg.getPermission(compoundId)).paused).to.equal(true);
    expect((await reg.getPermission(harvestId)).paused).to.equal(false);
  });

  it("independent pause: compound pause leaves harvest active", async function () {
    const ctx = await setup();
    const reg = ctx.permissionRegistryContract;

    await reg.connect(ctx.testUser).registerPermission(
      basePerm(ctx, { expiresAt: ctx.expiresAt }),
    );
    const harvestId = await reg.permissionIdFor(
      ctx.testUser.address,
      ctx.chainId,
      POOL_ID,
      ctx.usdc,
      ctx.weth,
    );

    await reg.connect(ctx.testUser).registerScopedPermission(
      basePerm(ctx, {
        allowedActions: COMPOUND_BIT | REVOKE_BIT,
        maxAmountPerTx: 1n,
        maxAmountPerDay: 1n,
        maxSlippageBps: 100n,
        expiresAt: ctx.expiresAt,
      }),
      SCOPE_COMPOUND,
    );
    const compoundId = await reg.permissionIdForScoped(
      ctx.testUser.address,
      ctx.chainId,
      POOL_ID,
      ctx.usdc,
      ctx.weth,
      SCOPE_COMPOUND,
    );

    await reg.connect(ctx.testUser).pause(compoundId);
    expect((await reg.getPermission(compoundId)).paused).to.equal(true);
    expect((await reg.getPermission(harvestId)).paused).to.equal(false);
    expect((await reg.getPermission(harvestId)).revoked).to.equal(false);
  });

  it("SC-05: revoked scoped permission id cannot be reused", async function () {
    const ctx = await setup();
    const reg = ctx.permissionRegistryContract;
    const perm = basePerm(ctx, {
      allowedActions: COMPOUND_BIT,
      maxAmountPerTx: 1n,
      maxAmountPerDay: 1n,
      maxSlippageBps: 100n,
      expiresAt: ctx.expiresAt,
    });
    await reg.connect(ctx.testUser).registerScopedPermission(perm, SCOPE_COMPOUND);
    const id = await reg.permissionIdForScoped(
      perm.user,
      perm.chainId,
      perm.poolId,
      perm.tokenA,
      perm.tokenB,
      SCOPE_COMPOUND,
    );
    await reg.connect(ctx.testUser).revoke(id);

    await expect(
      reg.connect(ctx.testUser).registerScopedPermission(perm, SCOPE_COMPOUND),
    ).to.be.revertedWithCustomError(reg, "PermissionAlreadyExists");
  });

  it("rejects zero scope and preserves legacy registerPermission", async function () {
    const ctx = await setup();
    const reg = ctx.permissionRegistryContract;
    const perm = basePerm(ctx, {
      allowedActions: COMPOUND_BIT,
      maxAmountPerTx: 1n,
      maxAmountPerDay: 1n,
      maxSlippageBps: 100n,
      expiresAt: ctx.expiresAt,
    });
    await expect(
      reg.connect(ctx.testUser).registerScopedPermission(perm, ethers.ZeroHash),
    ).to.be.revertedWithCustomError(reg, "InvalidPermissionParams");

    await reg.connect(ctx.testUser).registerPermission(
      basePerm(ctx, { expiresAt: ctx.expiresAt }),
    );
    // Different scope can still register for same user/pool/tokens
    await reg.connect(ctx.testUser).registerScopedPermission(
      {
        ...perm,
        allowedActions: COMPOUND_BIT,
      },
      SCOPE_OTHER,
    );
  });

  it("non-USDC tokenA decimals: limits use 8-decimal unit scale", async function () {
    const ctx = await setup();
    const reg = ctx.permissionRegistryContract;
    // Simulate cbBTC-style 8-decimal tokenA limits without changing catalogue.
    const maxTx = ethers.parseUnits("5000", 8);
    const maxDay = ethers.parseUnits("20000", 8);
    await reg.connect(ctx.testUser).registerScopedPermission(
      basePerm(ctx, {
        tokenA: ctx.weth, // stand-in non-USDC tokenA for id uniqueness in this suite
        tokenB: ctx.usdc,
        allowedActions: COMPOUND_BIT,
        maxAmountPerTx: maxTx,
        maxAmountPerDay: maxDay,
        maxSlippageBps: 500n,
        expiresAt: ctx.expiresAt,
      }),
      SCOPE_COMPOUND,
    );
    const id = await reg.permissionIdForScoped(
      ctx.testUser.address,
      ctx.chainId,
      POOL_ID,
      ctx.weth,
      ctx.usdc,
      SCOPE_COMPOUND,
    );
    const stored = await reg.getPermission(id);
    expect(stored.maxAmountPerTx).to.equal(maxTx);
    expect(stored.maxAmountPerDay).to.equal(maxDay);
    expect(stored.maxAmountPerTx).to.not.equal(ethers.parseUnits("5000", 6));
  });
});
