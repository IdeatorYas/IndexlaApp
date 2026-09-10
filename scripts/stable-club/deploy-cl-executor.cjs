/**
 * Deploy + link StableClubConcentratedLiquidityExecutor with its external libs.
 * Hardhat does not auto-link when using deployContract / bare getContractFactory.
 */
async function deployClExecutorLibraries(ethers) {
  const depositLib = await ethers.deployContract("ClFivePoolDepositLib");
  const exitLib = await ethers.deployContract("ClFivePoolExitLib");
  await depositLib.waitForDeployment();
  await exitLib.waitForDeployment();
  return {
    ClFivePoolDepositLib: await depositLib.getAddress(),
    ClFivePoolExitLib: await exitLib.getAddress(),
  };
}

async function getClExecutorFactory(ethers, libraries) {
  const libs = libraries ?? (await deployClExecutorLibraries(ethers));
  return ethers.getContractFactory("StableClubConcentratedLiquidityExecutor", {
    libraries: libs,
  });
}

async function deployClExecutor(ethers, constructorArgs, libraries) {
  const Factory = await getClExecutorFactory(ethers, libraries);
  const clExecutor = await Factory.deploy(...constructorArgs);
  await clExecutor.waitForDeployment();
  return clExecutor;
}

module.exports = {
  deployClExecutorLibraries,
  getClExecutorFactory,
  deployClExecutor,
};
