const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  DELAY_SECONDS,
  deployLocalGovernanceSafe,
  deployStableClubTimelock,
  impersonateTimelock,
  transferOwnablesToTimelock,
  wireGovernanceActivationOnAutomation,
  activateOfficialPoolViaTimelock,
} = require("../../scripts/stable-club/governance-activation-local.cjs");

const POOL_ID = ethers.keccak256(
  ethers.toUtf8Bytes("INDEXLA_STABLE_CLUB_BASE_USDC_cbBTC_AERO_CL100"),
);

async function deployActivationStack() {
  const signers = await ethers.getSigners();
  const [deployer] = signers;

  const permissionRegistry = await ethers.deployContract("PermissionRegistry");
  const feeRouter = await ethers.deployContract("FeeRouter", [deployer.address]);
  const oracleGuard = await ethers.deployContract("OracleGuard");
  const safetyController = await ethers.deployContract("SafetyController");
  const mevGuard = await ethers.deployContract("MevGuard");
  const openServGate = await ethers.deployContract("OpenServProposalGate");
  const step1Executor = await ethers.deployContract("StableClubExecutor", [
    await permissionRegistry.getAddress(),
    await feeRouter.getAddress(),
  ]);

  const automation = await ethers.deployContract("StableClubAutomationExecutor", [
    await permissionRegistry.getAddress(),
    await feeRouter.getAddress(),
    await oracleGuard.getAddress(),
    await safetyController.getAddress(),
    await mevGuard.getAddress(),
  ]);

  await permissionRegistry.setOperator(await automation.getAddress(), true);
  await permissionRegistry.setOperator(await step1Executor.getAddress(), true);
  await feeRouter.wireExecutor(await automation.getAddress());
  await safetyController.wireExecutor(await automation.getAddress());
  await mevGuard.setOracle(await oracleGuard.getAddress());

  const clAdapter = await ethers.deployContract("MockConcentratedLiquidityAdapter", [
    await automation.getAddress(),
    POOL_ID,
    "aerodrome-slipstream",
  ]);
  await automation.setAdapterApproval(await clAdapter.getAddress(), true);
  await automation.registerPool(POOL_ID, await clAdapter.getAddress(), true);
  await automation.setOfficialPoolCatalogue(POOL_ID, true);

  const criticalOwnables = [
    permissionRegistry,
    feeRouter,
    step1Executor,
    oracleGuard,
    mevGuard,
    safetyController,
    openServGate,
    automation,
  ];

  return {
    deployer,
    signers,
    permissionRegistry,
    feeRouter,
    oracleGuard,
    safetyController,
    mevGuard,
    openServGate,
    step1Executor,
    automation,
    criticalOwnables,
  };
}

async function wireTransferAndActivate(ctx, { timelock, govSafe, skipCriticalIndex }) {
  const timelockAddr = await timelock.getAddress();
  const safeAddr = await govSafe.getAddress();

  for (let i = 0; i < ctx.criticalOwnables.length; i++) {
    if (skipCriticalIndex === i) continue;
    await ctx.criticalOwnables[i].transferOwnership(timelockAddr);
  }

  await wireGovernanceActivationOnAutomation({
    automation: ctx.automation,
    timelock,
    govSafe,
    step1Executor: ctx.step1Executor,
    openServGate: ctx.openServGate,
  });

  await activateOfficialPoolViaTimelock(ctx.automation, timelockAddr, POOL_ID);
}

describe("StableClub on-chain governance activation guard", function () {
  it("rejects EOA owner direct activateOfficialPool before governance is wired", async function () {
    const ctx = await deployActivationStack();
    await expect(ctx.automation.activateOfficialPool(POOL_ID)).to.be.revertedWithCustomError(
      ctx.automation,
      "GovernanceActivationNotWired",
    );
  });

  it("rejects EOA owner direct activateOfficialPool after timelock owns automation", async function () {
    const ctx = await deployActivationStack();
    const govSafe = await deployLocalGovernanceSafe(ctx.signers.slice(0, 3));
    const timelock = await deployStableClubTimelock(govSafe);
    const timelockAddr = await timelock.getAddress();

    await transferOwnablesToTimelock(timelockAddr, ctx.criticalOwnables);
    await wireGovernanceActivationOnAutomation({
      automation: ctx.automation,
      timelock,
      govSafe,
      step1Executor: ctx.step1Executor,
      openServGate: ctx.openServGate,
    });

    await expect(ctx.automation.activateOfficialPool(POOL_ID)).to.be.revertedWithCustomError(
      ctx.automation,
      "Unauthorized",
    );
  });

  it("rejects activation when caller is not the configured timelock", async function () {
    const ctx = await deployActivationStack();
    const govSafe = await deployLocalGovernanceSafe(ctx.signers.slice(0, 3));
    const configuredTimelock = await deployStableClubTimelock(govSafe);
    const otherTimelock = await deployStableClubTimelock(govSafe);
    const configuredAddr = await configuredTimelock.getAddress();
    const otherAddr = await otherTimelock.getAddress();

    await transferOwnablesToTimelock(configuredAddr, ctx.criticalOwnables);
    await wireGovernanceActivationOnAutomation({
      automation: ctx.automation,
      timelock: configuredTimelock,
      govSafe,
      step1Executor: ctx.step1Executor,
      openServGate: ctx.openServGate,
    });

    const wrongSigner = await impersonateTimelock(otherAddr);
    await expect(
      ctx.automation.connect(wrongSigner).activateOfficialPool(POOL_ID),
    ).to.be.revertedWithCustomError(ctx.automation, "Unauthorized");
  });

  it("rejects wired timelock address with no contract code (fake EOA)", async function () {
    const ctx = await deployActivationStack();
    const govSafe = await deployLocalGovernanceSafe(ctx.signers.slice(0, 3));
    const fakeTimelockAddr = ctx.signers[9].address;

    await transferOwnablesToTimelock(fakeTimelockAddr, ctx.criticalOwnables);
    const fakeSigner = await impersonateTimelock(fakeTimelockAddr);
    await expect(
      ctx.automation
        .connect(fakeSigner)
        .wireGovernanceActivation(
          fakeTimelockAddr,
          await govSafe.getAddress(),
          await ctx.step1Executor.getAddress(),
          await ctx.openServGate.getAddress(),
        ),
    ).to.be.revertedWithCustomError(ctx.automation, "TimelockHasNoCode");
  });

  it("rejects timelock delay below the 48-hour policy", async function () {
    const ctx = await deployActivationStack();
    const govSafe = await deployLocalGovernanceSafe(ctx.signers.slice(0, 3));
    const shortDelay = await ethers.deployContract("MockShortDelayTimelock", [
      await govSafe.getAddress(),
      DELAY_SECONDS - 1,
    ]);

    await expect(
      wireTransferAndActivate(ctx, { timelock: shortDelay, govSafe }),
    ).to.be.revertedWithCustomError(ctx.automation, "TimelockDelayBelowPolicy");
  });

  it("rejects when configured Safe lacks PROPOSER_ROLE", async function () {
    const ctx = await deployActivationStack();
    const govSafe = await deployLocalGovernanceSafe(ctx.signers.slice(0, 3));
    const fakeTimelock = await ethers.deployContract("MockFakeTimelock", [
      await govSafe.getAddress(),
      DELAY_SECONDS,
      false,
      true,
    ]);

    await expect(
      wireTransferAndActivate(ctx, { timelock: fakeTimelock, govSafe }),
    ).to.be.revertedWithCustomError(ctx.automation, "SafeMissingProposerRole");
  });

  it("rejects when configured Safe lacks EXECUTOR_ROLE", async function () {
    const ctx = await deployActivationStack();
    const govSafe = await deployLocalGovernanceSafe(ctx.signers.slice(0, 3));
    const fakeTimelock = await ethers.deployContract("MockFakeTimelock", [
      await govSafe.getAddress(),
      DELAY_SECONDS,
      true,
      false,
    ]);

    await expect(
      wireTransferAndActivate(ctx, { timelock: fakeTimelock, govSafe }),
    ).to.be.revertedWithCustomError(ctx.automation, "SafeMissingExecutorRole");
  });

  it("rejects when a critical contract owner does not match the timelock", async function () {
    const ctx = await deployActivationStack();
    const govSafe = await deployLocalGovernanceSafe(ctx.signers.slice(0, 3));
    const timelock = await deployStableClubTimelock(govSafe);

    await expect(
      wireTransferAndActivate(ctx, { timelock, govSafe, skipCriticalIndex: 3 }),
    ).to.be.revertedWithCustomError(ctx.automation, "CriticalOwnerMismatch");
  });

  it("activates via valid timelock execution when all governance checks pass", async function () {
    const ctx = await deployActivationStack();
    const govSafe = await deployLocalGovernanceSafe(ctx.signers.slice(0, 3));
    const timelock = await deployStableClubTimelock(govSafe);

    await wireTransferAndActivate(ctx, { timelock, govSafe });

    expect(await ctx.automation.officialPoolsActivated(POOL_ID)).to.equal(true);
    expect(await ctx.automation.owner()).to.equal(await timelock.getAddress());
    expect(await ctx.permissionRegistry.owner()).to.equal(await timelock.getAddress());
    expect(await ctx.feeRouter.owner()).to.equal(await timelock.getAddress());
    expect(await ctx.step1Executor.owner()).to.equal(await timelock.getAddress());
  });
});

describe("wireGovernanceActivation bootstrap hardening", function () {
  it("rejects EOA pre-wiring before ownership transfer", async function () {
    const ctx = await deployActivationStack();
    const govSafe = await deployLocalGovernanceSafe(ctx.signers.slice(0, 3));
    const timelock = await deployStableClubTimelock(govSafe);
    const timelockAddr = await timelock.getAddress();

    await expect(
      ctx.automation.wireGovernanceActivation(
        timelockAddr,
        await govSafe.getAddress(),
        await ctx.step1Executor.getAddress(),
        await ctx.openServGate.getAddress(),
      ),
    ).to.be.revertedWithCustomError(ctx.automation, "CallerNotGovernanceTimelock");
  });

  it("rejects pre-transfer wiring when timelock impersonates but automation is still deployer-owned", async function () {
    const ctx = await deployActivationStack();
    const govSafe = await deployLocalGovernanceSafe(ctx.signers.slice(0, 3));
    const timelock = await deployStableClubTimelock(govSafe);
    const timelockAddr = await timelock.getAddress();

    for (let i = 0; i < ctx.criticalOwnables.length - 1; i++) {
      await ctx.criticalOwnables[i].transferOwnership(timelockAddr);
    }
    const tlSigner = await impersonateTimelock(timelockAddr);
    await expect(
      ctx.automation.connect(tlSigner).wireGovernanceActivation(
        timelockAddr,
        await govSafe.getAddress(),
        await ctx.step1Executor.getAddress(),
        await ctx.openServGate.getAddress(),
      ),
    ).to.be.revertedWithCustomError(ctx.automation, "CriticalOwnerMismatch");
  });

  it("rejects wiring when step1 executor owner does not match timelock", async function () {
    const ctx = await deployActivationStack();
    const govSafe = await deployLocalGovernanceSafe(ctx.signers.slice(0, 3));
    const timelock = await deployStableClubTimelock(govSafe);
    const timelockAddr = await timelock.getAddress();

    for (let i = 0; i < ctx.criticalOwnables.length; i++) {
      if (i === 2) continue;
      await ctx.criticalOwnables[i].transferOwnership(timelockAddr);
    }
    const tlSigner = await impersonateTimelock(timelockAddr);
    await expect(
      ctx.automation.connect(tlSigner).wireGovernanceActivation(
        timelockAddr,
        await govSafe.getAddress(),
        await ctx.step1Executor.getAddress(),
        await ctx.openServGate.getAddress(),
      ),
    ).to.be.revertedWithCustomError(ctx.automation, "CriticalOwnerMismatch");
  });

  it("rejects zero-address wiring inputs", async function () {
    const ctx = await deployActivationStack();
    const govSafe = await deployLocalGovernanceSafe(ctx.signers.slice(0, 3));
    const timelock = await deployStableClubTimelock(govSafe);
    const timelockAddr = await timelock.getAddress();
    await transferOwnablesToTimelock(timelockAddr, ctx.criticalOwnables);
    const tlSigner = await impersonateTimelock(timelockAddr);

    await expect(
      ctx.automation.connect(tlSigner).wireGovernanceActivation(
        timelockAddr,
        ethers.ZeroAddress,
        await ctx.step1Executor.getAddress(),
        await ctx.openServGate.getAddress(),
      ),
    ).to.be.revertedWithCustomError(ctx.automation, "Unauthorized");
  });

  it("rejects second wiring attempt (no rewiring)", async function () {
    const ctx = await deployActivationStack();
    const govSafe = await deployLocalGovernanceSafe(ctx.signers.slice(0, 3));
    const timelock = await deployStableClubTimelock(govSafe);
    const timelockAddr = await timelock.getAddress();
    await transferOwnablesToTimelock(timelockAddr, ctx.criticalOwnables);
    await wireGovernanceActivationOnAutomation({
      automation: ctx.automation,
      timelock,
      govSafe,
      step1Executor: ctx.step1Executor,
      openServGate: ctx.openServGate,
    });

    const tlSigner = await impersonateTimelock(timelockAddr);
    const altSafe = await deployLocalGovernanceSafe(ctx.signers.slice(3, 6));
    await expect(
      ctx.automation.connect(tlSigner).wireGovernanceActivation(
        timelockAddr,
        await altSafe.getAddress(),
        await ctx.step1Executor.getAddress(),
        await ctx.openServGate.getAddress(),
      ),
    ).to.be.revertedWithCustomError(ctx.automation, "GovernanceAlreadyWired");
  });

  it("allows valid one-time timelock wiring after ownership transfer", async function () {
    const ctx = await deployActivationStack();
    const govSafe = await deployLocalGovernanceSafe(ctx.signers.slice(0, 3));
    const timelock = await deployStableClubTimelock(govSafe);
    const timelockAddr = await timelock.getAddress();
    await transferOwnablesToTimelock(timelockAddr, ctx.criticalOwnables);
    await wireGovernanceActivationOnAutomation({
      automation: ctx.automation,
      timelock,
      govSafe,
      step1Executor: ctx.step1Executor,
      openServGate: ctx.openServGate,
    });

    expect(await ctx.automation.governanceActivationWired()).to.equal(true);
    expect(await ctx.automation.governanceTimelock()).to.equal(timelockAddr);
    expect(await ctx.automation.owner()).to.equal(timelockAddr);
    expect(await ctx.step1Executor.owner()).to.equal(timelockAddr);
  });
});
