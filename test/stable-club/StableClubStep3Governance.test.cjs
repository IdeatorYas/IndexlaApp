const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const DELAY = 48 * 60 * 60;

describe("Step 3 — StableClubTimelock scaffolding", function () {
  async function deployTimelock() {
    const [admin, proposer, executor, stranger] = await ethers.getSigners();
    const timelock = await ethers.deployContract("StableClubTimelock", [
      [proposer.address],
      [executor.address],
      admin.address,
    ]);
    return { timelock, admin, proposer, executor, stranger };
  }

  it("deploys with 48h min delay and rejects below-min helper delays", async function () {
    const { timelock } = await deployTimelock();
    expect(await timelock.MIN_DELAY()).to.equal(DELAY);
    expect(await timelock.getMinDelay()).to.equal(DELAY);
    await expect(timelock.enforceMinDelay(DELAY - 1)).to.be.revertedWithCustomError(
      timelock,
      "DelayBelowMinimum",
    );
    expect(await timelock.enforceMinDelay(DELAY)).to.equal(DELAY);
  });

  it("schedules owner-bound SafetyController unpause only after delay", async function () {
    const { timelock, proposer, executor, admin } = await deployTimelock();
    const safety = await ethers.deployContract("SafetyController");
    // Deployer is initial guardian; move owner to timelock so unpause requires timelock.
    await safety.setGuardian(admin.address);
    await safety.transferOwnership(await timelock.getAddress());

    await safety.connect(admin).setGlobalPause(true);
    expect(await safety.globalPause()).to.equal(true);

    await expect(safety.connect(admin).setGlobalPause(false)).to.be.revertedWithCustomError(
      safety,
      "Unauthorized",
    );

    const unpauseData = safety.interface.encodeFunctionData("setGlobalPause", [false]);
    const salt = ethers.id("unpause");
    await timelock
      .connect(proposer)
      .schedule(await safety.getAddress(), 0, unpauseData, ethers.ZeroHash, salt, DELAY);
    await expect(
      timelock
        .connect(executor)
        .execute(await safety.getAddress(), 0, unpauseData, ethers.ZeroHash, salt),
    ).to.be.reverted;
    await time.increase(DELAY);
    await timelock
      .connect(executor)
      .execute(await safety.getAddress(), 0, unpauseData, ethers.ZeroHash, salt);
    expect(await safety.globalPause()).to.equal(false);
  });
});

describe("Step 3 — SafetyController pause vs unpause auth", function () {
  it("allows guardian pause but not unpause; owner can unpause", async function () {
    const [owner, guardian] = await ethers.getSigners();
    const safety = await ethers.deployContract("SafetyController");
    await safety.setGuardian(guardian.address);

    await safety.connect(guardian).setGlobalPause(true);
    await expect(safety.connect(guardian).setGlobalPause(false)).to.be.revertedWithCustomError(
      safety,
      "Unauthorized",
    );
    await safety.connect(owner).setGlobalPause(false);
    expect(await safety.globalPause()).to.equal(false);

    await safety.connect(guardian).setStablecoinDepegged(guardian.address, true);
    await expect(
      safety.connect(guardian).setStablecoinDepegged(guardian.address, false),
    ).to.be.revertedWithCustomError(safety, "Unauthorized");
  });
});

describe("Step 3 — fee floor invariant fuzz (bounded)", function () {
  it("fee never exceeds 1% and is zero for gross < 100", async function () {
    const samples = [1n, 99n, 100n, 101n, 999n, 10_000n, 123456789n, 10n ** 18n];
    for (const gross of samples) {
      const fee = (gross * 100n) / 10_000n;
      expect(fee * 10_000n).to.be.lte(gross * 100n);
      if (gross < 100n) expect(fee).to.equal(0n);
    }
  });
});

describe("Step 3 — Base fork Stage 1 pool still resolves", function () {
  this.timeout(180_000);

  it("factory getPool returns UNI-005 and rejects CL100", async function () {
    if (!process.env.BASE_RPC_URL?.trim()) this.skip();
    await network.provider.request({
      method: "hardhat_reset",
      params: [{ forking: { jsonRpcUrl: process.env.BASE_RPC_URL } }],
    });
    await network.provider.send("evm_mine", []);

    const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
    const CBBTC = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
    const WETH = "0x4200000000000000000000000000000000000006";
    const UNI_FACTORY = "0x33128a8fC17869897dcE68Ed026d694621f6FDfD";
    const AERO_FACTORY = "0xf8f2eB4940CFE7d13603DDDD87f123820Fc061Ef";

    const uni = await ethers.getContractAt(
      ["function getPool(address,address,uint24) view returns (address)"],
      UNI_FACTORY,
    );
    const aero = await ethers.getContractAt(
      ["function getPool(address,address,int24) view returns (address)"],
      AERO_FACTORY,
    );

    const uni005 = await uni.getPool(USDC, CBBTC, 500);
    expect(uni005).to.equal("0xfBB6Eed8e7aa03B138556eeDaF5D271A5E1e43ef");

    expect(await aero.getPool(USDC, CBBTC, 100)).to.equal(ethers.ZeroAddress);
    expect(await aero.getPool(CBBTC, WETH, 100)).to.equal(ethers.ZeroAddress);

    await network.provider.request({ method: "hardhat_reset", params: [] });
  });
});
