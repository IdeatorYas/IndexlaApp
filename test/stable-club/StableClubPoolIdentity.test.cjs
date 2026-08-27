const { expect } = require("chai");
const { ethers } = require("hardhat");

const SQRT_1 = 79228162514264337593543950336n; // 2^96
const IDENTITY_IFACE = new ethers.Interface(["error PoolIdentityMismatch()"]);

describe("Pool identity — Uni V3 / Aerodrome valuation", function () {
  async function deployUniFixture(opts = {}) {
    const [deployer, user] = await ethers.getSigners();
    const token0 = await ethers.deployContract("MockERC20", ["T0", "T0", 6]);
    const token1 = await ethers.deployContract("MockERC20", ["T1", "T1", 8]);
    let lo = token0;
    let hi = token1;
    if ((await lo.getAddress()) > (await hi.getAddress())) {
      lo = token1;
      hi = token0;
    }
    const pool = await ethers.deployContract("MockClPoolForValuation", [
      await lo.getAddress(),
      await hi.getAddress(),
      SQRT_1,
    ]);
    const factory = await ethers.deployContract("MockUniV3FactoryForValuation");
    const fee = opts.fee ?? 500;
    await factory.setPool(await lo.getAddress(), await hi.getAddress(), fee, await pool.getAddress());
    const npm = await ethers.deployContract("MockUniNpmForValuation");
    const adapter = await ethers.deployContract("UniswapV3Adapter", [
      deployer.address,
      ethers.id("UNI_ID"),
      await npm.getAddress(),
      deployer.address,
      await pool.getAddress(),
      await factory.getAddress(),
      fee,
    ]);
    return { deployer, user, lo, hi, pool, factory, npm, adapter, fee };
  }

  async function deployAeroFixture(opts = {}) {
    const [deployer, user] = await ethers.getSigners();
    const token0 = await ethers.deployContract("MockERC20", ["T0", "T0", 6]);
    const token1 = await ethers.deployContract("MockERC20", ["T1", "T1", 8]);
    let lo = token0;
    let hi = token1;
    if ((await lo.getAddress()) > (await hi.getAddress())) {
      lo = token1;
      hi = token0;
    }
    const pool = await ethers.deployContract("MockClPoolForValuation", [
      await lo.getAddress(),
      await hi.getAddress(),
      SQRT_1,
    ]);
    const factory = await ethers.deployContract("MockAeroFactoryForValuation");
    const tickSpacing = opts.tickSpacing ?? 100;
    await factory.setPool(
      await lo.getAddress(),
      await hi.getAddress(),
      tickSpacing,
      await pool.getAddress(),
    );
    const npm = await ethers.deployContract("MockAeroNpmForValuation");
    const adapter = await ethers.deployContract("AerodromeSlipstreamAdapter", [
      deployer.address,
      ethers.id("AERO_ID"),
      await npm.getAddress(),
      deployer.address,
      await pool.getAddress(),
      await factory.getAddress(),
      tickSpacing,
      ethers.ZeroAddress,
    ]);
    return { deployer, user, lo, hi, pool, factory, npm, adapter, tickSpacing };
  }

  async function seedUniMismatch(ctx, wrongFee) {
    await ctx.npm.setPosition(
      1,
      ctx.user.address,
      await ctx.lo.getAddress(),
      await ctx.hi.getAddress(),
      wrongFee,
      -100,
      100,
      1_000_000n,
      0,
      0,
    );
  }

  async function seedAeroMismatch(ctx, wrongTickSpacing) {
    await ctx.npm.setPosition(
      1,
      ctx.user.address,
      await ctx.lo.getAddress(),
      await ctx.hi.getAddress(),
      wrongTickSpacing,
      -200,
      200,
      2_000_000n,
      0,
      0,
    );
  }

  function expectIdentityRevert(txPromise) {
    return expect(txPromise).to.be.revertedWithCustomError(
      { interface: IDENTITY_IFACE },
      "PoolIdentityMismatch",
    );
  }

  it("Uni V3: live amounts succeed when fee + factory pool match", async function () {
    const ctx = await deployUniFixture();
    await ctx.npm.setPosition(
      1,
      ctx.user.address,
      await ctx.lo.getAddress(),
      await ctx.hi.getAddress(),
      ctx.fee,
      -100,
      100,
      1_000_000n,
      0,
      0,
    );
    const [a0, a1] = await ctx.adapter.positionAmounts(1n);
    expect(a0 + a1).to.be.gt(0n);
  });

  it("Uni V3: fails closed on fee mismatch", async function () {
    const ctx = await deployUniFixture({ fee: 500 });
    await seedUniMismatch(ctx, 3000);
    await expectIdentityRevert(ctx.adapter.positionAmounts(1n));
  });

  it("Uni V3: fails closed when factory returns a different pool", async function () {
    const ctx = await deployUniFixture();
    const otherPool = await ethers.deployContract("MockClPoolForValuation", [
      await ctx.lo.getAddress(),
      await ctx.hi.getAddress(),
      SQRT_1,
    ]);
    await ctx.factory.setPool(
      await ctx.lo.getAddress(),
      await ctx.hi.getAddress(),
      ctx.fee,
      await otherPool.getAddress(),
    );
    await ctx.npm.setPosition(
      1,
      ctx.user.address,
      await ctx.lo.getAddress(),
      await ctx.hi.getAddress(),
      ctx.fee,
      -100,
      100,
      1_000_000n,
      0,
      0,
    );
    await expectIdentityRevert(ctx.adapter.positionAmounts(1n));
  });

  it("Uni V3: same-pair different-fee fails closed on every mutation path", async function () {
    const ctx = await deployUniFixture({ fee: 500 });
    await seedUniMismatch(ctx, 3000);
    const tokenA = await ctx.lo.getAddress();
    const tokenB = await ctx.hi.getAddress();

    await expectIdentityRevert(ctx.adapter.collectFees(ctx.user.address, 1n));
    await expectIdentityRevert(
      ctx.adapter.increaseLiquidity(ctx.user.address, 1n, tokenA, tokenB, 1n, 1n, 0n, 0n),
    );
    await expectIdentityRevert(
      ctx.adapter.decreaseLiquidity(ctx.user.address, 1n, tokenA, tokenB, 1n, 0n, 0n),
    );
    await expectIdentityRevert(
      ctx.adapter.closePosition(ctx.user.address, 1n, tokenA, tokenB, 0n, 0n),
    );
  });

  it("Aerodrome: live amounts succeed when tickSpacing + factory match", async function () {
    const ctx = await deployAeroFixture();
    await ctx.npm.setPosition(
      1,
      ctx.user.address,
      await ctx.lo.getAddress(),
      await ctx.hi.getAddress(),
      ctx.tickSpacing,
      -200,
      200,
      2_000_000n,
      0,
      0,
    );
    const [a0, a1] = await ctx.adapter.positionAmounts(1n);
    expect(a0 + a1).to.be.gt(0n);
  });

  it("Aerodrome: fails closed on tickSpacing mismatch", async function () {
    const ctx = await deployAeroFixture({ tickSpacing: 100 });
    await seedAeroMismatch(ctx, 10);
    await expectIdentityRevert(ctx.adapter.positionAmounts(1n));
  });

  it("Aerodrome: same-pair different-tickSpacing fails closed on every mutation path", async function () {
    const ctx = await deployAeroFixture({ tickSpacing: 100 });
    await seedAeroMismatch(ctx, 10);
    const tokenA = await ctx.lo.getAddress();
    const tokenB = await ctx.hi.getAddress();

    await expectIdentityRevert(ctx.adapter.collectFees(ctx.user.address, 1n));
    await expectIdentityRevert(ctx.adapter.collectRewards(ctx.user.address, 1n));
    await expectIdentityRevert(
      ctx.adapter.increaseLiquidity(ctx.user.address, 1n, tokenA, tokenB, 1n, 1n, 0n, 0n),
    );
    await expectIdentityRevert(
      ctx.adapter.decreaseLiquidity(ctx.user.address, 1n, tokenA, tokenB, 1n, 0n, 0n),
    );
    await expectIdentityRevert(
      ctx.adapter.closePosition(ctx.user.address, 1n, tokenA, tokenB, 0n, 0n),
    );
  });
});
