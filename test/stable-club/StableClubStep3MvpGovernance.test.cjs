const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const MVP_SAFE = "0x356A4A432EE57F31F5cF8Fdd55F95c1FF6Cd5910";
const MVP_SIGNERS = [
  "0x977e7055D097bE5924fBdAd7e5a330405820f168",
  "0xd31a835ec10932919e7Dd471e915F1cF97d98f1b",
  "0xF133d2AafD456359A6e2c9F0492c19aEDF7E8720",
];
const MVP_FEE = "0x9d269f7A3d3f781740081D35F086D68a4a21442D";
const DELAY = 48 * 60 * 60;

describe("Step 3 — MVP 2-of-3 Safe threshold (local mock)", function () {
  it("one confirmation cannot execute; two can", async function () {
    const [s0, s1, s2, stranger, targetOwner] = await ethers.getSigners();
    const safe = await ethers.deployContract("MockTwoOfThreeSafe", [
      [s0.address, s1.address, s2.address],
      2,
    ]);
    expect(await safe.getThreshold()).to.equal(2);

    // Target: a SafetyController owned by the mock Safe after transfer.
    const safety = await ethers.deployContract("SafetyController");
    await safety.transferOwnership(await safe.getAddress());

    const data = safety.interface.encodeFunctionData("setGuardian", [targetOwner.address]);
    const nonce = 1;
    const hash = await safe.txHash(await safety.getAddress(), 0, data, nonce);

    await safe.connect(s0).confirm(hash);
    await expect(safe.connect(s0).execute(await safety.getAddress(), 0, data, nonce)).to.be
      .revertedWithCustomError(safe, "ThresholdNotMet");

    await safe.connect(s1).confirm(hash);
    await safe.connect(s0).execute(await safety.getAddress(), 0, data, nonce);
    expect(await safety.guardian()).to.equal(targetOwner.address);

    await expect(safe.connect(stranger).confirm(ethers.id("x"))).to.be.revertedWithCustomError(
      safe,
      "NotOwner",
    );
  });
});

describe("Step 3 — MVP Safe controls Timelock; Timelock owns admin", function () {
  it("wires Safe as timelock proposer/executor and Timelock as SafetyController owner", async function () {
    const [deployer, guardian] = await ethers.getSigners();
    // Simulate Safe with MockTwoOfThreeSafe holding timelock roles.
    const govSafe = await ethers.deployContract("MockTwoOfThreeSafe", [
      [deployer.address, guardian.address, (await ethers.getSigners())[2].address],
      2,
    ]);
    const timelock = await ethers.deployContract("StableClubTimelock", [
      [await govSafe.getAddress()],
      [await govSafe.getAddress()],
      await govSafe.getAddress(),
    ]);
    const safety = await ethers.deployContract("SafetyController");
    await safety.setGuardian(guardian.address);
    await safety.transferOwnership(await timelock.getAddress());

    // Guardian can pause immediately; unpause requires Timelock (owned ops via Safe threshold).
    await safety.connect(guardian).setGlobalPause(true);
    await expect(safety.connect(guardian).setGlobalPause(false)).to.be.revertedWithCustomError(
      safety,
      "Unauthorized",
    );

    const unpause = safety.interface.encodeFunctionData("setGlobalPause", [false]);
    const salt = ethers.id("mvp-unpause");
    const scheduleData = timelock.interface.encodeFunctionData("schedule", [
      await safety.getAddress(),
      0,
      unpause,
      ethers.ZeroHash,
      salt,
      DELAY,
    ]);
    const nonce = 7;
    const hash = await govSafe.txHash(await timelock.getAddress(), 0, scheduleData, nonce);
    await govSafe.connect(deployer).confirm(hash);
    await expect(govSafe.connect(deployer).execute(await timelock.getAddress(), 0, scheduleData, nonce))
      .to.be.revertedWithCustomError(govSafe, "ThresholdNotMet");
    await govSafe.connect(guardian).confirm(hash);
    await govSafe.connect(deployer).execute(await timelock.getAddress(), 0, scheduleData, nonce);

    await time.increase(DELAY);

    const execData = timelock.interface.encodeFunctionData("execute", [
      await safety.getAddress(),
      0,
      unpause,
      ethers.ZeroHash,
      salt,
    ]);
    const execNonce = 8;
    const execHash = await govSafe.txHash(await timelock.getAddress(), 0, execData, execNonce);
    await govSafe.connect(deployer).confirm(execHash);
    await govSafe.connect(guardian).confirm(execHash);
    await govSafe.connect(deployer).execute(await timelock.getAddress(), 0, execData, execNonce);
    expect(await safety.globalPause()).to.equal(false);
  });
});

describe("Step 3 — Base fork MVP Safe verification", function () {
  this.timeout(120_000);

  it("Safe is 2-of-3 with configured owners; fee wallet is non-contract", async function () {
    if (!process.env.BASE_RPC_URL?.trim()) this.skip();
    await network.provider.request({
      method: "hardhat_reset",
      params: [{ forking: { jsonRpcUrl: process.env.BASE_RPC_URL } }],
    });
    await network.provider.send("evm_mine", []);

    const safe = await ethers.getContractAt(
      [
        "function getOwners() view returns (address[])",
        "function getThreshold() view returns (uint256)",
        "function isOwner(address) view returns (bool)",
      ],
      MVP_SAFE,
    );
    expect(await safe.getThreshold()).to.equal(2);
    const owners = await safe.getOwners();
    expect(owners.map((a) => a.toLowerCase()).sort()).to.deep.equal(
      MVP_SIGNERS.map((a) => a.toLowerCase()).sort(),
    );
    for (const s of MVP_SIGNERS) {
      expect(await safe.isOwner(s)).to.equal(true);
    }

    expect(await ethers.provider.getCode(MVP_FEE)).to.equal("0x");
    expect(((await ethers.provider.getCode(MVP_SAFE)).length - 2) / 2).to.be.gt(0);

    await network.provider.request({ method: "hardhat_reset", params: [] });
  });
});
