const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { activateStep2PoolWithGovernance } = require("../../scripts/stable-club/governance-activation-local.cjs");

const POOL_ID = ethers.keccak256(
  ethers.toUtf8Bytes("INDEXLA_STABLE_CLUB_BASE_USDC_cbBTC_AERO_CL100"),
);

const HARVEST_ONLY_ACTIONS = 1n << 8n;

async function deployHarvestStack() {
  const [deployer, user, other] = await ethers.getSigners();
  const permissionRegistry = await ethers.deployContract("PermissionRegistry");
  const feeRouter = await ethers.deployContract("FeeRouter", [deployer.address]);
  const oracleGuard = await ethers.deployContract("OracleGuard");
  const safetyController = await ethers.deployContract("SafetyController");
  const mevGuard = await ethers.deployContract("MevGuard");
  const automation = await ethers.deployContract("StableClubAutomationExecutor", [
    await permissionRegistry.getAddress(),
    await feeRouter.getAddress(),
    await oracleGuard.getAddress(),
    await safetyController.getAddress(),
    await mevGuard.getAddress(),
  ]);
  await permissionRegistry.setOperator(await automation.getAddress(), true);
  await feeRouter.wireExecutor(await automation.getAddress());
  await safetyController.wireExecutor(await automation.getAddress());
  await mevGuard.setOracle(await oracleGuard.getAddress());

  const openServGate = await ethers.deployContract("OpenServProposalGate");

  const usdcFeed = await ethers.deployContract("MockAggregatorV3", [1_00000000n]);
  const btcFeed = await ethers.deployContract("MockAggregatorV3", [100_00000000n]);
  const usdc = await ethers.deployContract("MockERC20", ["USD Coin", "USDC", 6]);
  const cbbtc = await ethers.deployContract("MockERC20", ["Coinbase BTC", "cbBTC", 8]);
  await oracleGuard.configureFeed(await usdc.getAddress(), await usdcFeed.getAddress(), 3600, 8);
  await oracleGuard.configureFeed(await cbbtc.getAddress(), await btcFeed.getAddress(), 3600, 8);

  const clAdapter = await ethers.deployContract("MockConcentratedLiquidityAdapter", [
    await automation.getAddress(),
    POOL_ID,
    "aerodrome-slipstream",
  ]);
  await automation.setAdapterApproval(await clAdapter.getAddress(), true);
  await automation.registerPool(POOL_ID, await clAdapter.getAddress(), true);
  await automation.setOfficialPoolCatalogue(POOL_ID, true);
  await automation.setTokenApproval(await usdc.getAddress(), true);
  await automation.setTokenApproval(await cbbtc.getAddress(), true);
  const signers = await ethers.getSigners();
  await activateStep2PoolWithGovernance({
    automation,
    permissionRegistry,
    feeRouter,
    oracleGuard,
    mevGuard,
    safetyController,
    openServGate,
    poolId: POOL_ID,
    signers: signers.slice(0, 3),
  });

  await usdc.mint(user.address, ethers.parseUnits("10000", 6));
  await cbbtc.mint(user.address, ethers.parseUnits("1", 8));
  await usdc.mint(await clAdapter.getAddress(), ethers.parseUnits("10000", 6));
  await cbbtc.mint(await clAdapter.getAddress(), ethers.parseUnits("1", 8));

  return {
    user,
    other,
    permissionRegistry,
    safetyController,
    automation,
    clAdapter,
    usdc,
    cbbtc,
  };
}

async function registerHarvestPermission(ctx, overrides = {}) {
  const perm = {
    user: ctx.user.address,
    chainId: (await ethers.provider.getNetwork()).chainId,
    poolId: POOL_ID,
    tokenA: await ctx.usdc.getAddress(),
    tokenB: await ctx.cbbtc.getAddress(),
    allowedActions: HARVEST_ONLY_ACTIONS,
    maxAmountPerTx: 0n,
    maxAmountPerDay: 0n,
    maxSlippageBps: 500n,
    minTimeBetweenExecutions: 0n,
    maxExecutionsPerDay: 50n,
    expiresAt: BigInt((await time.latest()) + 86400),
    revoked: false,
    paused: false,
    ...overrides,
  };
  await ctx.permissionRegistry.connect(ctx.user).registerPermission(perm);
  return ctx.permissionRegistry.permissionIdFor(
    perm.user,
    perm.chainId,
    perm.poolId,
    perm.tokenA,
    perm.tokenB,
  );
}

async function mintPositionViaExecutor(ctx, { approveAdapter = true } = {}) {
  const automationAddr = await ctx.automation.getAddress();
  await ethers.provider.send("hardhat_impersonateAccount", [automationAddr]);
  await ethers.provider.send("hardhat_setBalance", [
    automationAddr,
    ethers.toQuantity(ethers.parseEther("1")),
  ]);
  const automationSigner = await ethers.getSigner(automationAddr);
  await ctx.usdc.connect(ctx.user).transfer(automationAddr, ethers.parseUnits("200", 6));
  await ctx.cbbtc.connect(ctx.user).transfer(automationAddr, ethers.parseUnits("0.2", 8));
  await ctx.usdc.connect(automationSigner).approve(await ctx.clAdapter.getAddress(), ethers.parseUnits("200", 6));
  await ctx.cbbtc.connect(automationSigner).approve(await ctx.clAdapter.getAddress(), ethers.parseUnits("0.2", 8));
  await ctx.clAdapter.connect(automationSigner).mintPosition(
    ctx.user.address,
    await ctx.usdc.getAddress(),
    await ctx.cbbtc.getAddress(),
    -100000,
    -90000,
    ethers.parseUnits("200", 6),
    ethers.parseUnits("0.2", 8),
    0,
    0,
  );
  const tokenId = 1n;
  if (approveAdapter) {
    await ctx.clAdapter.connect(ctx.user).approve(await ctx.clAdapter.getAddress(), tokenId);
  }
  return tokenId;
}

describe("Stable Club harvest flow integration", function () {
  it("authorized user harvest collects fees on-chain", async function () {
    const ctx = await deployHarvestStack();
    const permissionId = await registerHarvestPermission(ctx);
    const tokenId = await mintPositionViaExecutor(ctx);
    const before = await ctx.usdc.balanceOf(ctx.user.address);
    await ctx.automation.connect(ctx.user).harvest(
      permissionId,
      101n,
      await ctx.clAdapter.getAddress(),
      tokenId,
    );
    const after = await ctx.usdc.balanceOf(ctx.user.address);
    expect(after).to.be.gt(before);
  });

  it("rejects wrong user, revoked permission, and replayed nonce", async function () {
    const ctx = await deployHarvestStack();
    const permissionId = await registerHarvestPermission(ctx);
    const tokenId = await mintPositionViaExecutor(ctx);

    await expect(
      ctx.automation.connect(ctx.other).harvest(
        permissionId,
        1n,
        await ctx.clAdapter.getAddress(),
        tokenId,
      ),
    ).to.be.reverted;

    await ctx.automation.connect(ctx.user).harvest(
      permissionId,
      2n,
      await ctx.clAdapter.getAddress(),
      tokenId,
    );

    await expect(
      ctx.automation.connect(ctx.user).harvest(
        permissionId,
        2n,
        await ctx.clAdapter.getAddress(),
        tokenId,
      ),
    ).to.be.reverted;

    await ctx.permissionRegistry.connect(ctx.user).revoke(permissionId);
    await expect(
      ctx.automation.connect(ctx.user).harvest(
        permissionId,
        3n,
        await ctx.clAdapter.getAddress(),
        tokenId,
      ),
    ).to.be.reverted;
  });

  it("rejects expired permission", async function () {
    const ctx = await deployHarvestStack();
    const permissionId = await registerHarvestPermission(ctx);
    const tokenId = await mintPositionViaExecutor(ctx);
    await time.increase(86401);
    await expect(
      ctx.automation.connect(ctx.user).harvest(
        permissionId,
        4n,
        await ctx.clAdapter.getAddress(),
        tokenId,
      ),
    ).to.be.reverted;
  });

  it("rejects harvest when automation is paused", async function () {
    const ctx = await deployHarvestStack();
    const permissionId = await registerHarvestPermission(ctx);
    const tokenId = await mintPositionViaExecutor(ctx);
    await ctx.safetyController.setPoolAutomationPaused(POOL_ID, true);
    await expect(
      ctx.automation.connect(ctx.user).harvest(
        permissionId,
        5n,
        await ctx.clAdapter.getAddress(),
        tokenId,
      ),
    ).to.be.revertedWithCustomError(ctx.safetyController, "AutomationPaused");
  });

  it("rejects harvest without position NFT approval", async function () {
    const ctx = await deployHarvestStack();
    const permissionId = await registerHarvestPermission(ctx);
    await mintPositionViaExecutor(ctx, { approveAdapter: false });
    await expect(
      ctx.automation.connect(ctx.user).harvest(
        permissionId,
        6n,
        await ctx.clAdapter.getAddress(),
        1n,
      ),
    ).to.be.revertedWithCustomError(ctx.automation, "PositionApprovalRequired");
  });
});
