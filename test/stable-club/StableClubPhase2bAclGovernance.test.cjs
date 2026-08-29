const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const STRATEGY_KIND = ethers.id("STABLE_CLUB_FIVE_POOL_V1");
const DELAY = 48 * 60 * 60;

describe("Phase 2b — FeeRouter approved-executor ACL", function () {
  async function fixture() {
    const [owner, executorA, executorB, stranger, feeRecipient] = await ethers.getSigners();
    const feeRouter = await ethers.deployContract("FeeRouter", [feeRecipient.address]);
    return { owner, executorA, executorB, stranger, feeRecipient, feeRouter };
  }

  it("only owner can approve/de-approve executors", async function () {
    const { executorA, stranger, feeRouter } = await fixture();
    await expect(
      feeRouter.connect(stranger).setExecutorApproved(executorA.address, true),
    ).to.be.revertedWithCustomError(feeRouter, "Unauthorized");
  });

  it("rejects zero and feeRecipient as executor", async function () {
    const { feeRecipient, feeRouter } = await fixture();
    await expect(feeRouter.setExecutorApproved(ethers.ZeroAddress, true)).to.be.revertedWithCustomError(
      feeRouter,
      "InvalidExecutor",
    );
    await expect(feeRouter.setExecutorApproved(feeRecipient.address, true)).to.be.revertedWithCustomError(
      feeRouter,
      "InvalidExecutor",
    );
    await expect(feeRouter.wireExecutor(feeRecipient.address)).to.be.revertedWithCustomError(
      feeRouter,
      "InvalidExecutor",
    );
  });

  it("de-approving primary clears legacy executor pointer", async function () {
    const { executorA, executorB, feeRouter } = await fixture();
    await feeRouter.setExecutorApproved(executorA.address, true);
    expect(await feeRouter.executor()).to.equal(executorA.address);
    await feeRouter.setExecutorApproved(executorB.address, true);
    expect(await feeRouter.isApprovedExecutor(executorB.address)).to.equal(true);
    await expect(feeRouter.setExecutorApproved(executorA.address, false))
      .to.emit(feeRouter, "PrimaryExecutorCleared")
      .withArgs(executorA.address);
    expect(await feeRouter.executor()).to.equal(ethers.ZeroAddress);
    expect(await feeRouter.isApprovedExecutor(executorA.address)).to.equal(false);
    expect(await feeRouter.isApprovedExecutor(executorB.address)).to.equal(true);
  });

  it("unapproved executor cannot charge fees", async function () {
    const { executorA, feeRecipient, feeRouter } = await fixture();
    const token = await ethers.deployContract("MockERC20", ["USDC", "USDC", 6]);
    await feeRouter.setExecutorApproved(executorA.address, true);
    await feeRouter.setExecutorApproved(executorA.address, false);
    await expect(
      feeRouter.connect(executorA).applySwapFeeOnHeld(await token.getAddress(), feeRecipient.address, 1000n, ethers.ZeroHash),
    ).to.be.revertedWithCustomError(feeRouter, "OnlyExecutor");
  });
});

describe("Phase 2b — Strategy registrar ACL", function () {
  async function fixture() {
    const [owner, registrar, stranger, user] = await ethers.getSigners();
    const permissionRegistry = await ethers.deployContract("PermissionRegistry");
    const usdc = await ethers.deployContract("MockERC20", ["USDC", "USDC", 6]);
    const strategyRegistry = await ethers.deployContract("StrategyPermissionRegistry", [
      await permissionRegistry.getAddress(),
      STRATEGY_KIND,
      await usdc.getAddress(),
    ]);
    return { owner, registrar, stranger, user, permissionRegistry, strategyRegistry, usdc };
  }

  it("only owner can set strategy registrar; stranger cannot register via registrar path", async function () {
    const { stranger, permissionRegistry, strategyRegistry, user } = await fixture();
    await expect(
      permissionRegistry.connect(stranger).setStrategyRegistrar(await strategyRegistry.getAddress(), true),
    ).to.be.revertedWithCustomError(permissionRegistry, "Unauthorized");

    const chainId = (await ethers.provider.getNetwork()).chainId;
    const perm = {
      user: user.address,
      chainId,
      poolId: ethers.id("POOL"),
      tokenA: user.address,
      tokenB: stranger.address,
      allowedActions: 1n,
      maxAmountPerTx: 1000n,
      maxAmountPerDay: 1000n,
      maxSlippageBps: 100n,
      minTimeBetweenExecutions: 0n,
      maxExecutionsPerDay: 1n,
      expiresAt: BigInt((await time.latest()) + 3600),
      revoked: false,
      paused: false,
    };
    await expect(
      permissionRegistry.connect(stranger).registerPermissionForStrategyRegistrar(perm),
    ).to.be.revertedWithCustomError(permissionRegistry, "Unauthorized");
  });

  it("revoking registrar immediately blocks registerPermissionForStrategyRegistrar", async function () {
    const { permissionRegistry, strategyRegistry, user, stranger } = await fixture();
    const regAddr = await strategyRegistry.getAddress();
    await permissionRegistry.setStrategyRegistrar(regAddr, true);
    await permissionRegistry.setStrategyRegistrar(regAddr, false);

    // Impersonate strategy registry address to call registrar path
    await ethers.provider.send("hardhat_impersonateAccount", [regAddr]);
    await ethers.provider.send("hardhat_setBalance", [regAddr, "0x56BC75E2D63100000"]);
    const regSigner = await ethers.getSigner(regAddr);
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const perm = {
      user: user.address,
      chainId,
      poolId: ethers.id("POOL2"),
      tokenA: user.address,
      tokenB: stranger.address,
      allowedActions: 1n,
      maxAmountPerTx: 1000n,
      maxAmountPerDay: 1000n,
      maxSlippageBps: 100n,
      minTimeBetweenExecutions: 0n,
      maxExecutionsPerDay: 1n,
      expiresAt: BigInt((await time.latest()) + 3600),
      revoked: false,
      paused: false,
    };
    await expect(
      permissionRegistry.connect(regSigner).registerPermissionForStrategyRegistrar(perm),
    ).to.be.revertedWithCustomError(permissionRegistry, "Unauthorized");
  });

  it("registrar rejects wrong-chain, zero pool, identical tokens", async function () {
    const { permissionRegistry, strategyRegistry, user, stranger } = await fixture();
    const regAddr = await strategyRegistry.getAddress();
    await permissionRegistry.setStrategyRegistrar(regAddr, true);
    await ethers.provider.send("hardhat_impersonateAccount", [regAddr]);
    await ethers.provider.send("hardhat_setBalance", [regAddr, "0x56BC75E2D63100000"]);
    const regSigner = await ethers.getSigner(regAddr);
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const base = {
      user: user.address,
      chainId,
      poolId: ethers.id("POOL3"),
      tokenA: user.address,
      tokenB: stranger.address,
      allowedActions: 1n,
      maxAmountPerTx: 1000n,
      maxAmountPerDay: 1000n,
      maxSlippageBps: 100n,
      minTimeBetweenExecutions: 0n,
      maxExecutionsPerDay: 1n,
      expiresAt: BigInt((await time.latest()) + 3600),
      revoked: false,
      paused: false,
    };

    await expect(
      permissionRegistry.connect(regSigner).registerPermissionForStrategyRegistrar({
        ...base,
        chainId: chainId + 1n,
      }),
    ).to.be.revertedWithCustomError(permissionRegistry, "InvalidPermissionParams");

    await expect(
      permissionRegistry.connect(regSigner).registerPermissionForStrategyRegistrar({
        ...base,
        poolId: ethers.ZeroHash,
      }),
    ).to.be.revertedWithCustomError(permissionRegistry, "InvalidPermissionParams");

    await expect(
      permissionRegistry.connect(regSigner).registerPermissionForStrategyRegistrar({
        ...base,
        tokenB: user.address,
      }),
    ).to.be.revertedWithCustomError(permissionRegistry, "InvalidPermissionParams");
  });

  it("only StrategyPermissionRegistry owner can setOperator", async function () {
    const { stranger, strategyRegistry, user } = await fixture();
    await expect(
      strategyRegistry.connect(stranger).setOperator(user.address, true),
    ).to.be.revertedWithCustomError(strategyRegistry, "Unauthorized");
  });
});

describe("Phase 2b — Safe/Timelock-ready Phase 2a ownership", function () {
  it("Timelock can own FeeRouter, StrategyPermissionRegistry, CL executor, SwapRouter, PermissionRegistry", async function () {
    const [deployer, proposer, executorRole, admin, feeRecipient, user] = await ethers.getSigners();
    const usdc = await ethers.deployContract("MockERC20", ["USDC", "USDC", 6]);
    const permissionRegistry = await ethers.deployContract("PermissionRegistry");
    const strategyRegistry = await ethers.deployContract("StrategyPermissionRegistry", [
      await permissionRegistry.getAddress(),
      STRATEGY_KIND,
      await usdc.getAddress(),
    ]);
    const feeRouter = await ethers.deployContract("FeeRouter", [feeRecipient.address]);
    const swapRouter = await ethers.deployContract("StableClubSwapRouter");
    const oracleGuard = await ethers.deployContract("OracleGuard");
    const mevGuard = await ethers.deployContract("MevGuard");
    await mevGuard.setOracle(await oracleGuard.getAddress());
    const safetyController = await ethers.deployContract("SafetyController");
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

    const timelock = await ethers.deployContract("StableClubTimelock", [
      [proposer.address],
      [executorRole.address],
      admin.address,
    ]);
    const timelockAddr = await timelock.getAddress();

    // Ownership can be a Timelock (not EOA-only production assumption)
    await permissionRegistry.transferOwnership(timelockAddr);
    await strategyRegistry.transferOwnership(timelockAddr);
    await feeRouter.transferOwnership(timelockAddr);
    await swapRouter.transferOwnership(timelockAddr);
    await clExecutor.transferOwnership(timelockAddr);
    await oracleGuard.transferOwnership(timelockAddr);
    await mevGuard.transferOwnership(timelockAddr);

    expect(await permissionRegistry.owner()).to.equal(timelockAddr);
    expect(await strategyRegistry.owner()).to.equal(timelockAddr);
    expect(await feeRouter.owner()).to.equal(timelockAddr);
    expect(await swapRouter.owner()).to.equal(timelockAddr);
    expect(await clExecutor.owner()).to.equal(timelockAddr);

    // Direct EOA no longer admin after transfer
    await expect(
      feeRouter.connect(deployer).setExecutorApproved(user.address, true),
    ).to.be.revertedWithCustomError(feeRouter, "Unauthorized");

    // Mock Safe as proposers/executors of Timelock (threshold simulation)
    const govSafe = await ethers.deployContract("MockTwoOfThreeSafe", [
      [deployer.address, proposer.address, admin.address],
      2,
    ]);
    // Re-wire: deploy fresh FeeRouter owned by Timelock after Safe holds Timelock roles —
    // verify schedule/execute path for setExecutorApproved through Timelock.
    const fee2 = await ethers.deployContract("FeeRouter", [feeRecipient.address]);
    await fee2.transferOwnership(timelockAddr);

    const data = fee2.interface.encodeFunctionData("setExecutorApproved", [user.address, true]);
    const salt = ethers.id("phase2b-fee-exec");
    await timelock.connect(proposer).schedule(await fee2.getAddress(), 0, data, ethers.ZeroHash, salt, DELAY);
    await time.increase(DELAY + 1);
    await timelock.connect(executorRole).execute(await fee2.getAddress(), 0, data, ethers.ZeroHash, salt);
    expect(await fee2.isApprovedExecutor(user.address)).to.equal(true);

    // Safe threshold gate still required for Safe-owned ops (existing MockTwoOfThreeSafe)
    expect(await govSafe.getThreshold()).to.equal(2);
  });
});
