const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");

const POOL_ID = ethers.keccak256(
  ethers.toUtf8Bytes("INDEXLA_STABLE_CLUB_TEST_POOL_BASE_INTERNAL_V1"),
);

const OUTPUT_PATH = path.join(
  __dirname,
  "../../src/lib/stable-club/generated/local-deployments.json",
);

async function deployStableClubStack() {
  const [deployer, testUser, feeRecipient] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  const permissionRegistry = await ethers.deployContract("PermissionRegistry");
  const feeRouter = await ethers.deployContract("FeeRouter", [feeRecipient.address]);
  const executor = await ethers.deployContract("StableClubExecutor", [
    await permissionRegistry.getAddress(),
    await feeRouter.getAddress(),
  ]);
  await permissionRegistry.setOperator(await executor.getAddress(), true);
  await feeRouter.wireExecutor(await executor.getAddress());

  const testAdapter = await ethers.deployContract("TestPoolAdapter", [
    await executor.getAddress(),
  ]);

  const usdc = await ethers.deployContract("MockERC20", ["USD Coin", "USDC", 6]);
  const weth = await ethers.deployContract("MockERC20", ["Wrapped Ether", "WETH", 18]);

  const usdcAddress = await usdc.getAddress();
  const wethAddress = await weth.getAddress();
  const testAdapterAddress = await testAdapter.getAddress();
  const executorAddress = await executor.getAddress();
  const feeRouterAddress = await feeRouter.getAddress();
  const permissionRegistryAddress = await permissionRegistry.getAddress();

  await executor.setAdapterApproval(testAdapterAddress, true);
  await executor.registerPool(POOL_ID, testAdapterAddress, true);
  await executor.setTokenApproval(usdcAddress, true);
  await executor.setTokenApproval(wethAddress, true);

  await usdc.mint(deployer.address, ethers.parseUnits("1000000", 6));
  await usdc.mint(testUser.address, ethers.parseUnits("1000000", 6));
  await weth.mint(testAdapterAddress, ethers.parseEther("100000"));
  await usdc.mint(testAdapterAddress, ethers.parseUnits("1000000", 6));

  return {
    chainId: Number(network.chainId),
    network: "hardhat-local",
    isTestOnly: true,
    label: "INDEXLA Stable Club local dev deployment (TEST ONLY)",
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    testUserAddress: testUser.address,
    feeRecipient: feeRecipient.address,
    permissionRegistry: permissionRegistryAddress,
    feeRouter: feeRouterAddress,
    executor: executorAddress,
    testAdapter: testAdapterAddress,
    usdc: usdcAddress,
    weth: wethAddress,
    poolId: POOL_ID,
    rpcUrl: "http://127.0.0.1:8545",
    permissionRegistryContract: permissionRegistry,
    feeRouterContract: feeRouter,
    executorContract: executor,
    testAdapterContract: testAdapter,
    usdcContract: usdc,
    wethContract: weth,
    testUser,
    feeRecipientSigner: feeRecipient,
  };
}

function toDeploymentJson(stack) {
  const {
    permissionRegistryContract,
    feeRouterContract,
    executorContract,
    testAdapterContract,
    usdcContract,
    wethContract,
    testUser,
    feeRecipientSigner,
    ...json
  } = stack;
  return {
    chainId: stack.chainId,
    network: stack.network,
    isTestOnly: stack.isTestOnly,
    label: stack.label,
    deployedAt: stack.deployedAt,
    deployer: stack.deployer,
    testUser: stack.testUserAddress,
    feeRecipient: stack.feeRecipient,
    permissionRegistry: stack.permissionRegistry,
    feeRouter: stack.feeRouter,
    executor: stack.executor,
    testAdapter: stack.testAdapter,
    usdc: stack.usdc,
    weth: stack.weth,
    poolId: stack.poolId,
    rpcUrl: stack.rpcUrl,
  };
}

async function main() {
  const stack = await deployStableClubStack();
  const deployments = toDeploymentJson(stack);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(deployments, null, 2)}\n`, "utf8");

  console.log("Stable Club local deployment written to:");
  console.log(OUTPUT_PATH);
  console.log(JSON.stringify(deployments, null, 2));
}

module.exports = {
  deployStableClubStack,
  toDeploymentJson,
  POOL_ID,
  OUTPUT_PATH,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
