const { ethers } = require("hardhat");

const DELAY_SECONDS = 48 * 60 * 60;

async function impersonateTimelock(timelockAddr) {
  await ethers.provider.send("hardhat_impersonateAccount", [timelockAddr]);
  await ethers.provider.send("hardhat_setBalance", [
    timelockAddr,
    ethers.toQuantity(ethers.parseEther("1")),
  ]);
  return ethers.getSigner(timelockAddr);
}

async function deployLocalGovernanceSafe(signers) {
  const [s0, s1, s2] = signers;
  return ethers.deployContract("MockTwoOfThreeSafe", [[s0.address, s1.address, s2.address], 2]);
}

async function deployStableClubTimelock(govSafe) {
  const safeAddr = await govSafe.getAddress();
  return ethers.deployContract("StableClubTimelock", [[safeAddr], [safeAddr], safeAddr]);
}

async function transferOwnablesToTimelock(timelockAddr, ownables) {
  for (const contract of ownables) {
    await contract.transferOwnership(timelockAddr);
  }
}

async function wireGovernanceActivationOnAutomation({
  automation,
  timelock,
  govSafe,
  step1Executor,
  openServGate,
}) {
  const timelockAddr = await timelock.getAddress();
  const safeAddr = await govSafe.getAddress();
  const tlSigner = await impersonateTimelock(timelockAddr);
  await automation
    .connect(tlSigner)
    .wireGovernanceActivation(
      timelockAddr,
      safeAddr,
      await step1Executor.getAddress(),
      await openServGate.getAddress(),
    );
  return { timelockAddr, timelockSigner: tlSigner };
}

async function activateOfficialPoolViaTimelock(automation, timelockAddr, poolId) {
  const tlSigner = await impersonateTimelock(timelockAddr);
  await automation.connect(tlSigner).activateOfficialPool(poolId);
}

async function setupGovernanceActivationForAutomation({
  automation,
  permissionRegistry,
  feeRouter,
  step1Executor,
  oracleGuard,
  mevGuard,
  safetyController,
  openServGate,
  signers,
}) {
  const govSafe = await deployLocalGovernanceSafe(signers);
  const timelock = await deployStableClubTimelock(govSafe);
  const timelockAddr = await timelock.getAddress();

  await transferOwnablesToTimelock(timelockAddr, [
    permissionRegistry,
    feeRouter,
    step1Executor,
    oracleGuard,
    mevGuard,
    safetyController,
    openServGate,
    automation,
  ]);

  const wired = await wireGovernanceActivationOnAutomation({
    automation,
    timelock,
    govSafe,
    step1Executor,
    openServGate,
  });

  return {
    govSafe,
    timelock,
    timelockAddr,
    ...wired,
  };
}

async function activateStep2PoolWithGovernance({
  automation,
  permissionRegistry,
  feeRouter,
  oracleGuard,
  mevGuard,
  safetyController,
  openServGate,
  poolId,
  signers,
  step1Executor,
}) {
  let executor = step1Executor;
  if (!executor) {
    executor = await ethers.deployContract("StableClubExecutor", [
      await permissionRegistry.getAddress(),
      await feeRouter.getAddress(),
    ]);
    await permissionRegistry.setOperator(await executor.getAddress(), true);
  }

  const { timelockAddr } = await setupGovernanceActivationForAutomation({
    automation,
    permissionRegistry,
    feeRouter,
    step1Executor: executor,
    oracleGuard,
    mevGuard,
    safetyController,
    openServGate,
    signers,
  });
  await activateOfficialPoolViaTimelock(automation, timelockAddr, poolId);
  return { timelockAddr, step1Executor: executor };
}

module.exports = {
  DELAY_SECONDS,
  impersonateTimelock,
  deployLocalGovernanceSafe,
  deployStableClubTimelock,
  transferOwnablesToTimelock,
  wireGovernanceActivationOnAutomation,
  activateOfficialPoolViaTimelock,
  setupGovernanceActivationForAutomation,
  activateStep2PoolWithGovernance,
};
