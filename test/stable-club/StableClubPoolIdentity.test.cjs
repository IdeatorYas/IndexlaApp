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
    await ctx.npm.setPosition(
      1,
      ctx.user.address,
      await ctx.lo.getAddress(),
      await ctx.hi.getAddress(),
      3000,
      -100,
      100,
      1_000_000n,
      0,
      0,
    );
    await expect(ctx.adapter.positionAmounts(1n)).to.be.revertedWithCustomError(
      { interface: IDENTITY_IFACE },
      "PoolIdentityMismatch",
    );
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
    await expect(ctx.adapter.positionAmounts(1n)).to.be.revertedWithCustomError(
      { interface: IDENTITY_IFACE },
      "PoolIdentityMismatch",
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
    await ctx.npm.setPosition(
      1,
      ctx.user.address,
      await ctx.lo.getAddress(),
      await ctx.hi.getAddress(),
      10,
      -200,
      200,
      2_000_000n,
      0,
      0,
    );
    await expect(ctx.adapter.positionAmounts(1n)).to.be.revertedWithCustomError(
      { interface: IDENTITY_IFACE },
      "PoolIdentityMismatch",
    );
  });
});
