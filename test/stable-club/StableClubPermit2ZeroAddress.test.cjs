const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

/**
 * Phase 2b follow-up — Permit2 address(0) rejection on every setPermit2 path.
 * Constructors leave permit2 unset (zero); setters must never accept zero.
 */
describe("Permit2 zero-address hardening", function () {
  async function deployAllTargets() {
    const [owner, feeRecipient, stranger] = await ethers.getSigners();
    const permissionRegistry = await ethers.deployContract("PermissionRegistry");
    const feeRouter = await ethers.deployContract("FeeRouter", [feeRecipient.address]);
    const executor = await ethers.deployContract("StableClubExecutor", [
      await permissionRegistry.getAddress(),
      await feeRouter.getAddress(),
    ]);
    const oracleGuard = await ethers.deployContract("OracleGuard");
    const safetyController = await ethers.deployContract("SafetyController");
    const mevGuard = await ethers.deployContract("MevGuard");
    await mevGuard.setOracle(await oracleGuard.getAddress());
    const automation = await ethers.deployContract("StableClubAutomationExecutor", [
      await permissionRegistry.getAddress(),
      await feeRouter.getAddress(),
      await oracleGuard.getAddress(),
      await safetyController.getAddress(),
      await mevGuard.getAddress(),
    ]);
    const strategyKind = ethers.id("STABLE_CLUB_FIVE_POOL_V1");
    const usdc = await ethers.deployContract("MockERC20", ["USDC", "USDC", 6]);
    const strategyRegistry = await ethers.deployContract("StrategyPermissionRegistry", [
      await permissionRegistry.getAddress(),
      strategyKind,
      await usdc.getAddress(),
    ]);
    const swapRouter = await ethers.deployContract("MockSwapRouter");
    const clExecutor = await ethers.deployContract("StableClubConcentratedLiquidityExecutor", [
      await permissionRegistry.getAddress(),
      await strategyRegistry.getAddress(),
      await feeRouter.getAddress(),
      await swapRouter.getAddress(),
      await mevGuard.getAddress(),
      await oracleGuard.getAddress(),
      await safetyController.getAddress(),
      await usdc.getAddress(),
    ]);
    const permit2 = await ethers.deployContract("MockPermit2");
    return {
      owner,
      stranger,
      feeRecipient,
      feeRouter,
      executor,
      automation,
      clExecutor,
      permit2,
      usdc,
      safetyController,
    };
  }

  it("deployments leave Permit2 unset (address(0)) until explicitly wired", async function () {
    const { feeRouter, executor, automation, clExecutor } = await deployAllTargets();
    expect(await feeRouter.permit2()).to.equal(ethers.ZeroAddress);
    expect(await executor.permit2()).to.equal(ethers.ZeroAddress);
    expect(await automation.permit2()).to.equal(ethers.ZeroAddress);
    expect(await clExecutor.permit2()).to.equal(ethers.ZeroAddress);
  });

  it("owner cannot setPermit2(address(0)) on FeeRouter / Executor / Automation / CL executor", async function () {
    const { feeRouter, executor, automation, clExecutor, permit2 } = await deployAllTargets();
    const p2 = await permit2.getAddress();

    // First wire a valid address, then prove zero cannot clear it.
    await feeRouter.setPermit2(p2);
    await executor.setPermit2(p2);
    await automation.setPermit2(p2);
    await clExecutor.setPermit2(p2);

    await expect(feeRouter.setPermit2(ethers.ZeroAddress)).to.be.revertedWithCustomError(
      feeRouter,
      "InvalidPermit2",
    );
    await expect(executor.setPermit2(ethers.ZeroAddress)).to.be.revertedWithCustomError(
      executor,
      "InvalidPermit2",
    );
    await expect(automation.setPermit2(ethers.ZeroAddress)).to.be.revertedWithCustomError(
      automation,
      "InvalidPermit2",
    );
    await expect(clExecutor.setPermit2(ethers.ZeroAddress)).to.be.revertedWithCustomError(
      clExecutor,
      "InvalidPermit2",
    );

    // Still wired to the valid Permit2 after rejected clear attempts.
    expect(await feeRouter.permit2()).to.equal(p2);
    expect(await executor.permit2()).to.equal(p2);
    expect(await automation.permit2()).to.equal(p2);
    expect(await clExecutor.permit2()).to.equal(p2);
  });

  it("setPermit2(address(0)) also reverts when Permit2 is still unset", async function () {
    const { feeRouter, executor, automation, clExecutor } = await deployAllTargets();
    await expect(feeRouter.setPermit2(ethers.ZeroAddress)).to.be.revertedWithCustomError(
      feeRouter,
      "InvalidPermit2",
    );
    await expect(executor.setPermit2(ethers.ZeroAddress)).to.be.revertedWithCustomError(
      executor,
      "InvalidPermit2",
    );
    await expect(automation.setPermit2(ethers.ZeroAddress)).to.be.revertedWithCustomError(
      automation,
      "InvalidPermit2",
    );
    await expect(clExecutor.setPermit2(ethers.ZeroAddress)).to.be.revertedWithCustomError(
      clExecutor,
      "InvalidPermit2",
    );
  });

  it("non-owner cannot setPermit2 even with a valid address", async function () {
    const { stranger, feeRouter, executor, automation, clExecutor, permit2 } = await deployAllTargets();
    const p2 = await permit2.getAddress();
    await expect(feeRouter.connect(stranger).setPermit2(p2)).to.be.revertedWithCustomError(
      feeRouter,
      "Unauthorized",
    );
    await expect(executor.connect(stranger).setPermit2(p2)).to.be.revertedWithCustomError(
      executor,
      "Unauthorized",
    );
    await expect(automation.connect(stranger).setPermit2(p2)).to.be.revertedWithCustomError(
      automation,
      "Unauthorized",
    );
    await expect(clExecutor.connect(stranger).setPermit2(p2)).to.be.revertedWithCustomError(
      clExecutor,
      "Unauthorized",
    );
  });

  it("valid Permit2 address still wires and FeeRouter pulls via Permit2", async function () {
    const [owner, executorSigner, user, feeRecipient] = await ethers.getSigners();
    const token = await ethers.deployContract("MockERC20", ["USDC", "USDC", 6]);
    const permit2 = await ethers.deployContract("MockPermit2");
    const feeRouter = await ethers.deployContract("FeeRouter", [feeRecipient.address]);
    await feeRouter.wireExecutor(executorSigner.address);
    await feeRouter.setPermit2(await permit2.getAddress());
    expect(await feeRouter.permit2()).to.equal(await permit2.getAddress());

    const gross = 10_000n;
    await token.mint(user.address, gross);
    await token.connect(user).approve(await permit2.getAddress(), gross);
    await permit2
      .connect(user)
      .approve(await token.getAddress(), await feeRouter.getAddress(), gross, (await time.latest()) + 3600);

    await expect(
      feeRouter
        .connect(executorSigner)
        .applySwapFee(await token.getAddress(), user.address, gross, ethers.id("p")),
    ).to.emit(feeRouter, "SwapFeeCharged");
    expect(await token.balanceOf(feeRecipient.address)).to.equal(100n);
    expect(await token.balanceOf(executorSigner.address)).to.equal(9_900n);
  });

  it("unset Permit2 legacy ERC20 path still works for local/test (never calling setPermit2)", async function () {
    const [, executorSigner, user, feeRecipient] = await ethers.getSigners();
    const token = await ethers.deployContract("MockERC20", ["USDC", "USDC", 6]);
    const feeRouter = await ethers.deployContract("FeeRouter", [feeRecipient.address]);
    await feeRouter.wireExecutor(executorSigner.address);
    expect(await feeRouter.permit2()).to.equal(ethers.ZeroAddress);
    const gross = 1_000n;
    await token.mint(user.address, gross);
    await token.connect(user).approve(await feeRouter.getAddress(), gross);
    await feeRouter
      .connect(executorSigner)
      .applySwapFee(await token.getAddress(), user.address, gross, ethers.id("l"));
    expect(await token.balanceOf(feeRecipient.address)).to.equal(10n);
  });
});
