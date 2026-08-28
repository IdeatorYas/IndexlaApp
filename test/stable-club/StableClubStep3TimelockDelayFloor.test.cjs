const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const MIN = 48 * 60 * 60;
const HOUR = 60 * 60;

describe("Step 3 — StableClubTimelock MIN_DELAY floor (adversarial)", function () {
  async function deployTimelock() {
    const [admin, proposer, executor] = await ethers.getSigners();
    const timelock = await ethers.deployContract("StableClubTimelock", [
      [proposer.address],
      [executor.address],
      admin.address,
    ]);
    return { timelock, admin, proposer, executor };
  }

  it("deploys with 48h min delay", async function () {
    const { timelock } = await deployTimelock();
    expect(await timelock.MIN_DELAY()).to.equal(MIN);
    expect(await timelock.getMinDelay()).to.equal(MIN);
  });

  const belowMinCases = [
    { label: "0", delay: 0 },
    { label: "1h", delay: HOUR },
    { label: "47h59m", delay: MIN - 1 },
  ];

  for (const { label, delay } of belowMinCases) {
    it(`schedule reverts below MIN_DELAY (${label})`, async function () {
      const { timelock, proposer } = await deployTimelock();
      const safety = await ethers.deployContract("SafetyController");
      const data = safety.interface.encodeFunctionData("setGlobalPause", [true]);
      await expect(
        timelock
          .connect(proposer)
          .schedule(await safety.getAddress(), 0, data, ethers.ZeroHash, ethers.id(label), delay),
      ).to.be.revertedWithCustomError(timelock, "DelayBelowMinimum");
    });

    it(`scheduleBatch reverts below MIN_DELAY (${label})`, async function () {
      const { timelock, proposer } = await deployTimelock();
      const safety = await ethers.deployContract("SafetyController");
      const data = safety.interface.encodeFunctionData("setGlobalPause", [true]);
      await expect(
        timelock.connect(proposer).scheduleBatch(
          [await safety.getAddress()],
          [0],
          [data],
          ethers.ZeroHash,
          ethers.id(`batch-${label}`),
          delay,
        ),
      ).to.be.revertedWithCustomError(timelock, "DelayBelowMinimum");
    });
  }

  it("schedule succeeds at exactly MIN_DELAY", async function () {
    const { timelock, proposer, executor } = await deployTimelock();
    const safety = await ethers.deployContract("SafetyController");
    await safety.transferOwnership(await timelock.getAddress());
    const data = safety.interface.encodeFunctionData("setGlobalPause", [false]);
    const salt = ethers.id("exact-min");
    await timelock
      .connect(proposer)
      .schedule(await safety.getAddress(), 0, data, ethers.ZeroHash, salt, MIN);
    await expect(
      timelock.connect(executor).execute(await safety.getAddress(), 0, data, ethers.ZeroHash, salt),
    ).to.be.reverted;
    await time.increase(MIN);
    await timelock.connect(executor).execute(await safety.getAddress(), 0, data, ethers.ZeroHash, salt);
    expect(await safety.globalPause()).to.equal(false);
  });

  it("increasing delay above MIN_DELAY via self-call updateDelay succeeds", async function () {
    const { timelock, proposer, executor } = await deployTimelock();
    const newDelay = MIN + 24 * HOUR;
    const updateData = timelock.interface.encodeFunctionData("updateDelay", [newDelay]);
    const salt = ethers.id("raise-delay");
    await timelock
      .connect(proposer)
      .schedule(await timelock.getAddress(), 0, updateData, ethers.ZeroHash, salt, MIN);
    await time.increase(MIN);
    await timelock.connect(executor).execute(await timelock.getAddress(), 0, updateData, ethers.ZeroHash, salt);
    expect(await timelock.getMinDelay()).to.equal(newDelay);
  });

  for (const { label, delay } of belowMinCases) {
    it(`self-call updateDelay reverts below MIN_DELAY (${label})`, async function () {
      const { timelock, proposer, executor } = await deployTimelock();
      const updateData = timelock.interface.encodeFunctionData("updateDelay", [delay]);
      const salt = ethers.id(`update-${label}`);
      await timelock
        .connect(proposer)
        .schedule(await timelock.getAddress(), 0, updateData, ethers.ZeroHash, salt, MIN);
      await time.increase(MIN);
      await expect(
        timelock.connect(executor).execute(await timelock.getAddress(), 0, updateData, ethers.ZeroHash, salt),
      ).to.be.revertedWithCustomError(timelock, "DelayBelowMinimum");
      expect(await timelock.getMinDelay()).to.equal(MIN);
    });
  }

  it("batch self-call updateDelay(0) cannot bypass floor", async function () {
    const { timelock, proposer, executor } = await deployTimelock();
    const updateData = timelock.interface.encodeFunctionData("updateDelay", [0]);
    const salt = ethers.id("batch-bypass");
    await timelock.connect(proposer).scheduleBatch(
      [await timelock.getAddress()],
      [0],
      [updateData],
      ethers.ZeroHash,
      salt,
      MIN,
    );
    await time.increase(MIN);
    await expect(
      timelock.connect(executor).executeBatch(
        [await timelock.getAddress()],
        [0],
        [updateData],
        ethers.ZeroHash,
        salt,
      ),
    ).to.be.revertedWithCustomError(timelock, "DelayBelowMinimum");
    expect(await timelock.getMinDelay()).to.equal(MIN);
  });

  it("direct updateDelay from EOA reverts (OZ auth)", async function () {
    const { timelock, proposer } = await deployTimelock();
    await expect(timelock.connect(proposer).updateDelay(MIN)).to.be.revertedWithCustomError(
      timelock,
      "TimelockUnauthorizedCaller",
    );
  });

  it("guardian emergency pause remains immediate; unpause still delayed", async function () {
    const { timelock, proposer, executor, admin } = await deployTimelock();
    const safety = await ethers.deployContract("SafetyController");
    await safety.setGuardian(admin.address);
    await safety.transferOwnership(await timelock.getAddress());

    await safety.connect(admin).setGlobalPause(true);
    expect(await safety.globalPause()).to.equal(true);
    await expect(safety.connect(admin).setGlobalPause(false)).to.be.revertedWithCustomError(
      safety,
      "Unauthorized",
    );

    const unpause = safety.interface.encodeFunctionData("setGlobalPause", [false]);
    const salt = ethers.id("unpause-delayed");
    await timelock
      .connect(proposer)
      .schedule(await safety.getAddress(), 0, unpause, ethers.ZeroHash, salt, MIN);
    await expect(
      timelock.connect(executor).execute(await safety.getAddress(), 0, unpause, ethers.ZeroHash, salt),
    ).to.be.reverted;
    await time.increase(MIN);
    await timelock.connect(executor).execute(await safety.getAddress(), 0, unpause, ethers.ZeroHash, salt);
    expect(await safety.globalPause()).to.equal(false);
  });
});
