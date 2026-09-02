const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const {
  deployStableClubStack,
  POOL_ID,
  approvePermit2Pull,
} = require("../../scripts/stable-club/deploy-local.cjs");

const MVP_SAFE = "0x356A4A432EE57F31F5cF8Fdd55F95c1FF6Cd5910";
const MVP_FEE = "0x9d269f7A3d3f781740081D35F086D68a4a21442D";
const DELAY = 48 * 60 * 60;
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const RECOMMENDED_GAS_CEILING_WEI = 1_000_000_000n; // 1 gwei — Timelock-configurable

const ALL_ACTIONS =
  (1n << 0n) |
  (1n << 1n) |
  (1n << 2n) |
  (1n << 3n) |
  (1n << 4n) |
  (1n << 6n) |
  (1n << 7n);

const OWNABLE_KEYS = [
  "permissionRegistry",
  "feeRouter",
  "executor",
  "oracleGuard",
  "mevGuard",
  "safetyController",
  "openServGate",
  "automation",
];

describe("Step 3 — Base-fork deployment rehearsal (no mainnet)", function () {
  this.timeout(300_000);

  async function resetFork() {
    if (!process.env.BASE_RPC_URL?.trim()) return false;
    await network.provider.request({
      method: "hardhat_reset",
      params: [{ forking: { jsonRpcUrl: process.env.BASE_RPC_URL } }],
    });
    await network.provider.send("evm_mine", []);
    return true;
  }

  after(async function () {
    await network.provider.request({ method: "hardhat_reset", params: [] });
  });

  it("Timelock+Safe ownership, fee routing, pause/delay, enter/exit (impersonation only)", async function () {
    if (!(await resetFork())) this.skip();

    const [deployer, user, guardian, other, feeExec] = await ethers.getSigners();

    const permissionRegistry = await ethers.deployContract("PermissionRegistry");
    const feeRouter = await ethers.deployContract("FeeRouter", [MVP_FEE]);
    const executor = await ethers.deployContract("StableClubExecutor", [
      await permissionRegistry.getAddress(),
      await feeRouter.getAddress(),
    ]);
    const oracleGuard = await ethers.deployContract("OracleGuard");
    const safetyController = await ethers.deployContract("SafetyController");
    const mevGuard = await ethers.deployContract("MevGuard");
    const openServGate = await ethers.deployContract("OpenServProposalGate");
    const automation = await ethers.deployContract("StableClubAutomationExecutor", [
      await permissionRegistry.getAddress(),
      await feeRouter.getAddress(),
      await oracleGuard.getAddress(),
      await safetyController.getAddress(),
      await mevGuard.getAddress(),
    ]);

    await permissionRegistry.setOperator(await executor.getAddress(), true);
    await permissionRegistry.setOperator(await automation.getAddress(), true);
    await feeRouter.wireExecutor(await executor.getAddress());
    await feeRouter.setPermit2(PERMIT2);
    await executor.setPermit2(PERMIT2);
    await automation.setPermit2(PERMIT2);
    await mevGuard.setOracle(await oracleGuard.getAddress());
    await safetyController.setGuardian(guardian.address);
    await safetyController.setMaxGasPriceWei(RECOMMENDED_GAS_CEILING_WEI);

    const timelock = await ethers.deployContract("StableClubTimelock", [
      [MVP_SAFE],
      [MVP_SAFE],
      MVP_SAFE,
    ]);
    const timelockAddr = await timelock.getAddress();

    const owned = {
      permissionRegistry,
      feeRouter,
      executor,
      oracleGuard,
      mevGuard,
      safetyController,
      openServGate,
      automation,
    };

    for (const c of Object.values(owned)) {
      await c.transferOwnership(timelockAddr);
    }

    for (const key of OWNABLE_KEYS) {
      const owner = (await owned[key].owner()).toLowerCase();
      expect(owner, key).to.equal(timelockAddr.toLowerCase());
      expect(owner).to.not.equal(deployer.address.toLowerCase());
      expect(owner).to.not.equal(user.address.toLowerCase());
      expect(owner).to.not.equal(guardian.address.toLowerCase());
      expect(owner).to.not.equal(MVP_SAFE.toLowerCase());
    }
    expect(await feeRouter.feeRecipient()).to.equal(MVP_FEE);
    expect(await feeRouter.permit2()).to.equal(PERMIT2);
    expect(await safetyController.maxGasPriceWei()).to.equal(RECOMMENDED_GAS_CEILING_WEI);

    expect(await timelock.hasRole(await timelock.PROPOSER_ROLE(), MVP_SAFE)).to.equal(true);
    expect(await timelock.hasRole(await timelock.EXECUTOR_ROLE(), MVP_SAFE)).to.equal(true);

    // Impersonate MVP Safe for Timelock schedule/execute (fork rehearsal only)
    await network.provider.request({ method: "hardhat_impersonateAccount", params: [MVP_SAFE] });
    await network.provider.send("hardhat_setBalance", [MVP_SAFE, "0x56BC75E2D63100000"]);
    const safeSigner = await ethers.getSigner(MVP_SAFE);

    // Emergency pause (guardian) immediate; unpause blocked for guardian
    await safetyController.connect(guardian).setGlobalPause(true);
    expect(await safetyController.globalPause()).to.equal(true);
    await expect(safetyController.connect(guardian).setGlobalPause(false)).to.be.revertedWithCustomError(
      safetyController,
      "Unauthorized",
    );

    // Delayed unpause via Timelock (48h)
    const unpauseData = safetyController.interface.encodeFunctionData("setGlobalPause", [false]);
    const salt = ethers.id("rehearsal-unpause");
    await timelock
      .connect(safeSigner)
      .schedule(await safetyController.getAddress(), 0, unpauseData, ethers.ZeroHash, salt, DELAY);
    await expect(
      timelock
        .connect(safeSigner)
        .execute(await safetyController.getAddress(), 0, unpauseData, ethers.ZeroHash, salt),
    ).to.be.reverted;
    await time.increase(DELAY);
    await timelock
      .connect(safeSigner)
      .execute(await safetyController.getAddress(), 0, unpauseData, ethers.ZeroHash, salt);
    expect(await safetyController.globalPause()).to.equal(false);

    // Config change also delayed (gas ceiling Timelock-configurable)
    const newCeiling = 2_000_000_000n;
    const gasData = safetyController.interface.encodeFunctionData("setMaxGasPriceWei", [newCeiling]);
    const gasSalt = ethers.id("rehearsal-gas");
    await timelock
      .connect(safeSigner)
      .schedule(await safetyController.getAddress(), 0, gasData, ethers.ZeroHash, gasSalt, DELAY);
    await time.increase(DELAY);
    await timelock
      .connect(safeSigner)
      .execute(await safetyController.getAddress(), 0, gasData, ethers.ZeroHash, gasSalt);
    expect(await safetyController.maxGasPriceWei()).to.equal(newCeiling);

    await expect(
      timelock
        .connect(other)
        .schedule(
          await safetyController.getAddress(),
          0,
          unpauseData,
          ethers.ZeroHash,
          ethers.id("eoa-blocked"),
          DELAY,
        ),
    ).to.be.reverted;

    await network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: [MVP_SAFE],
    });

    // Fee routing to verified INDEXLA fee recipient (MockPermit2; no real funds)
    const token = await ethers.deployContract("MockERC20", ["USDC", "USDC", 6]);
    const mockPermit2 = await ethers.deployContract("MockPermit2");
    const localFee = await ethers.deployContract("FeeRouter", [MVP_FEE]);
    await localFee.wireExecutor(feeExec.address);
    await localFee.setPermit2(await mockPermit2.getAddress());
    const gross = 10_000n;
    await token.mint(user.address, gross);
    await token.connect(user).approve(await mockPermit2.getAddress(), gross);
    await mockPermit2
      .connect(user)
      .approve(await token.getAddress(), await localFee.getAddress(), gross, (await time.latest()) + 3600);
    await localFee.connect(feeExec).applySwapFee(await token.getAddress(), user.address, gross, ethers.id("fee"));
    expect(await token.balanceOf(MVP_FEE)).to.equal(100n);
    expect(await token.balanceOf(feeExec.address)).to.equal(9900n);

    // Enter/exit with local test stack (impersonation/mocks only — no mainnet funds)
    const stack = await deployStableClubStack();
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const perm = {
      user: stack.testUser.address,
      chainId,
      poolId: POOL_ID,
      tokenA: stack.usdc,
      tokenB: stack.weth,
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
    await stack.permissionRegistryContract.connect(stack.testUser).registerPermission(perm);
    const permissionId = await stack.permissionRegistryContract.permissionIdFor(
      perm.user,
      perm.chainId,
      perm.poolId,
      perm.tokenA,
      perm.tokenB,
    );

    const deposit = ethers.parseUnits("200", 6);
    await approvePermit2Pull(
      stack.usdcContract,
      stack.testUser,
      stack.permit2Contract,
      stack.executor,
      deposit,
    );
    const depositTx = await stack.executorContract.connect(stack.testUser).depositAndAddLiquidity(
      permissionId,
      1n,
      stack.testAdapter,
      stack.usdc,
      stack.usdc,
      stack.weth,
      deposit,
      0n,
      0n,
      1n,
      50n,
    );
    const depositReceipt = await depositTx.wait();
    expect(depositReceipt.gasUsed).to.be.gt(0n);

    const lpBal = await stack.testAdapterContract.balanceOf(stack.testUser.address);
    expect(lpBal).to.be.gt(0n);
    await stack.testAdapterContract.connect(stack.testUser).approve(stack.executor, lpBal);
    const exitTx = await stack.executorContract.connect(stack.testUser).withdrawAll(
      permissionId,
      2n,
      stack.testAdapter,
      stack.usdc,
      stack.weth,
      lpBal,
      1n,
      1n,
      50n,
    );
    const exitReceipt = await exitTx.wait();
    expect(exitReceipt.gasUsed).to.be.gt(0n);
    expect(await stack.testAdapterContract.balanceOf(stack.testUser.address)).to.equal(0n);

    // Ownership map unchanged after fee/enter-exit side path
    for (const key of OWNABLE_KEYS) {
      expect(await owned[key].owner()).to.equal(timelockAddr);
    }

    console.log(
      JSON.stringify({
        rehearsal: "ok",
        timelock: timelockAddr,
        feeRecipient: MVP_FEE,
        ownership: Object.fromEntries(
          await Promise.all(OWNABLE_KEYS.map(async (k) => [k, await owned[k].owner()])),
        ),
        depositL2GasUsed: depositReceipt.gasUsed.toString(),
        exitL2GasUsed: exitReceipt.gasUsed.toString(),
        recommendedGasCeilingWei: RECOMMENDED_GAS_CEILING_WEI.toString(),
      }),
    );
  });
});
