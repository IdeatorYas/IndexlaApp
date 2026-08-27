const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const POOL_ID = ethers.keccak256(
  ethers.toUtf8Bytes("INDEXLA_STABLE_CLUB_BASE_USDC_cbBTC_AERO_CL100"),
);

const AUTOMATION_ACTIONS =
  (1n << 8n) | // Harvest
  (1n << 9n) | // Compound
  (1n << 10n); // Rebalance

async function deployStep2Stack() {
  const [deployer, user, feeRecipient] = await ethers.getSigners();

  const permissionRegistry = await ethers.deployContract("PermissionRegistry");
  const feeRouter = await ethers.deployContract("FeeRouter", [feeRecipient.address]);
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
  await permissionRegistry.setOperator(await automation.getAddress(), true);
  await feeRouter.wireExecutor(await automation.getAddress());
  await safetyController.wireExecutor(await automation.getAddress());

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
  await automation.activateOfficialPool(POOL_ID);
  await automation.setTokenApproval(await usdc.getAddress(), true);
  await automation.setTokenApproval(await cbbtc.getAddress(), true);

  await usdc.mint(user.address, ethers.parseUnits("100000", 6));
  await cbbtc.mint(user.address, ethers.parseUnits("10", 8));
  await usdc.mint(await clAdapter.getAddress(), ethers.parseUnits("100000", 6));
  await cbbtc.mint(await clAdapter.getAddress(), ethers.parseUnits("10", 8));

  return {
    deployer,
    user,
    feeRecipient,
    permissionRegistry,
    feeRouter,
    oracleGuard,
    safetyController,
    mevGuard,
    openServGate,
    automation,
    clAdapter,
    usdc,
    cbbtc,
    usdcFeed,
    btcFeed,
  };
}

async function registerAutomationPermission(ctx) {
  const perm = {
    user: ctx.user.address,
    chainId: (await ethers.provider.getNetwork()).chainId,
    poolId: POOL_ID,
    tokenA: await ctx.usdc.getAddress(),
    tokenB: await ctx.cbbtc.getAddress(),
    allowedActions: AUTOMATION_ACTIONS,
    maxAmountPerTx: ethers.parseUnits("50000", 6),
    maxAmountPerDay: ethers.parseUnits("200000", 6),
    maxSlippageBps: 500n,
    minTimeBetweenExecutions: 0n,
    maxExecutionsPerDay: 50n,
    expiresAt: BigInt((await time.latest()) + 86400 * 7),
    revoked: false,
    paused: false,
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

describe("Stable Club Step 2 — Oracle / Safety / OpenServ", function () {
  it("oracle rejects missing feeds and accepts configured fresh feeds", async function () {
    const ctx = await deployStep2Stack();
    const rogue = await ethers.deployContract("MockERC20", ["Rogue", "RG", 18]);
    await expect(
      ctx.oracleGuard.validatePrices(await rogue.getAddress(), await ctx.usdc.getAddress(), 200),
    ).to.be.revertedWithCustomError(ctx.oracleGuard, "MissingFeed");

    expect(
      await ctx.oracleGuard.validatePrices(
        await ctx.usdc.getAddress(),
        await ctx.cbbtc.getAddress(),
        200,
      ),
    ).to.equal(true);
  });

  it("safety controller blocks automation when paused or depegged", async function () {
    const ctx = await deployStep2Stack();
    await ctx.safetyController.setPoolAutomationPaused(POOL_ID, true);
    await expect(ctx.safetyController.assertAutomationAllowed(POOL_ID)).to.be.revertedWithCustomError(
      ctx.safetyController,
      "AutomationPaused",
    );

    await ctx.safetyController.setPoolAutomationPaused(POOL_ID, false);
    await ctx.safetyController.setStablecoinDepegged(await ctx.usdc.getAddress(), true);
    await expect(
      ctx.safetyController.assertTokenNotDepegged(await ctx.usdc.getAddress()),
    ).to.be.revertedWithCustomError(ctx.safetyController, "DepegActive");
  });

  it("mev guard enforces deadline and min-out", async function () {
    const ctx = await deployStep2Stack();
    const now = await time.latest();
    await expect(
      ctx.mevGuard.assertSwapProtections(1000, 0, 1000, now + 60),
    ).to.be.revertedWithCustomError(ctx.mevGuard, "MinOutTooLow");

    await expect(
      ctx.mevGuard.assertSwapProtections(1000, 985, 1000, now - 1),
    ).to.be.revertedWithCustomError(ctx.mevGuard, "DeadlineExpired");

    // minOut=1 with inflated quote must not bypass impact floor (H2)
    await expect(
      ctx.mevGuard.assertSwapProtections(1000, 1, 1000, now + 60),
    ).to.be.revertedWithCustomError(ctx.mevGuard, "PriceImpactTooHigh");
  });

  it("OpenServ proposal gate rejects duplicates and can trip circuit", async function () {
    const ctx = await deployStep2Stack();
    await ctx.openServGate.setLimits(10, 20, 2);
    const proposal = {
      user: ctx.user.address,
      permissionId: ethers.ZeroHash,
      poolId: POOL_ID,
      positionTokenId: 1n,
      action: 0,
      reasonCode: ethers.id("fees-exceed-gas"),
      observedValue: 25n,
      timestamp: 0n,
      idempotencyKey: ethers.id("idem-a"),
      consumed: false,
      rejected: false,
    };
    const id = await ctx.openServGate.submitProposal.staticCall(proposal);
    await ctx.openServGate.submitProposal(proposal);
    await expect(ctx.openServGate.submitProposal(proposal)).to.be.revertedWithCustomError(
      ctx.openServGate,
      "DuplicateIdempotency",
    );

    await ctx.openServGate.markRejected(id, ethers.id("failed"));
    proposal.idempotencyKey = ethers.id("idem-b");
    const id2 = await ctx.openServGate.submitProposal.staticCall(proposal);
    await ctx.openServGate.submitProposal(proposal);
    await ctx.openServGate.markRejected(id2, ethers.id("failed"));
    expect(await ctx.openServGate.circuitBroken()).to.equal(true);
  });
});

describe("Stable Club Step 2 — automation harvest", function () {
  it("harvests fees to the user and retains no executor balances", async function () {
    const ctx = await deployStep2Stack();
    const permissionId = await registerAutomationPermission(ctx);

    // Mint a CL position owned by the user via adapter (executor path).
    await ctx.usdc.connect(ctx.user).approve(await ctx.automation.getAddress(), ethers.parseUnits("500", 6));
    await ctx.cbbtc.connect(ctx.user).approve(await ctx.automation.getAddress(), ethers.parseUnits("1", 8));

    // Direct mint through adapter requires executor caller — simulate by temporarily
    // approving tokens to adapter and calling mint from automation via compound path
    // with zero swap after a manual mint impersonation is complex; mint as executor:
    await ethers.provider.send("hardhat_impersonateAccount", [await ctx.automation.getAddress()]);
    await ethers.provider.send("hardhat_setBalance", [
      await ctx.automation.getAddress(),
      ethers.toQuantity(ethers.parseEther("1")),
    ]);
    const automationSigner = await ethers.getSigner(await ctx.automation.getAddress());
    await ctx.usdc.connect(ctx.user).transfer(await ctx.automation.getAddress(), ethers.parseUnits("200", 6));
    await ctx.cbbtc.connect(ctx.user).transfer(await ctx.automation.getAddress(), ethers.parseUnits("0.2", 8));
    await ctx.usdc.connect(automationSigner).approve(await ctx.clAdapter.getAddress(), ethers.parseUnits("200", 6));
    await ctx.cbbtc.connect(automationSigner).approve(await ctx.clAdapter.getAddress(), ethers.parseUnits("0.2", 8));
    const mintTx = await ctx.clAdapter.connect(automationSigner).mintPosition(
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
    const receipt = await mintTx.wait();
    // tokenId is 1 for first mint
    const tokenId = 1n;
    expect(await ctx.clAdapter.ownerOf(tokenId)).to.equal(ctx.user.address);

    await ctx.automation.connect(ctx.user).harvest(
      permissionId,
      1n,
      await ctx.clAdapter.getAddress(),
      tokenId,
    );

    expect(await ctx.usdc.balanceOf(await ctx.automation.getAddress())).to.equal(0n);
    expect(await ctx.cbbtc.balanceOf(await ctx.automation.getAddress())).to.equal(0n);
    expect(receipt.status).to.equal(1);
  });

  it("rejects harvest on non-activated official pool", async function () {
    const ctx = await deployStep2Stack();
    const otherPool = ethers.keccak256(ethers.toUtf8Bytes("OTHER_POOL"));
    const otherAdapter = await ethers.deployContract("MockConcentratedLiquidityAdapter", [
      await ctx.automation.getAddress(),
      otherPool,
      "uniswap-v3",
    ]);
    await ctx.automation.setAdapterApproval(await otherAdapter.getAddress(), true);
    await ctx.automation.registerPool(otherPool, await otherAdapter.getAddress(), true);
    // deliberately not catalogued / activated

    const perm = {
      user: ctx.user.address,
      chainId: (await ethers.provider.getNetwork()).chainId,
      poolId: otherPool,
      tokenA: await ctx.usdc.getAddress(),
      tokenB: await ctx.cbbtc.getAddress(),
      allowedActions: AUTOMATION_ACTIONS,
      maxAmountPerTx: ethers.parseUnits("50000", 6),
      maxAmountPerDay: ethers.parseUnits("200000", 6),
      maxSlippageBps: 500n,
      minTimeBetweenExecutions: 0n,
      maxExecutionsPerDay: 50n,
      expiresAt: BigInt((await time.latest()) + 86400 * 7),
      revoked: false,
      paused: false,
    };
    await ctx.permissionRegistry.connect(ctx.user).registerPermission(perm);
    const permissionId = await ctx.permissionRegistry.permissionIdFor(
      perm.user,
      perm.chainId,
      perm.poolId,
      perm.tokenA,
      perm.tokenB,
    );

    await expect(
      ctx.automation.connect(ctx.user).harvest(permissionId, 1n, await otherAdapter.getAddress(), 1n),
    ).to.be.revertedWithCustomError(ctx.automation, "OfficialPoolNotActivated");
  });
});

describe("Stable Club Step 2 — Base fork catalogue smoke", function () {
  it("resolves Uniswap and Aerodrome factories when BASE_RPC_URL is set", async function () {
    if (!process.env.BASE_RPC_URL?.trim()) {
      this.skip();
    }

    await ethers.provider.send("hardhat_reset", [
      {
        forking: {
          jsonRpcUrl: process.env.BASE_RPC_URL,
        },
      },
    ]);

    const network = await ethers.provider.getNetwork();
    expect(network.chainId).to.equal(8453n);

    const uniFactory = "0x33128a8fC17869897dcE68Ed026d694621f6FDfD";
    const aeroFactory = "0xf8f2eB4940CFE7d13603DDDD87f123820Fc061Ef";
    const uniNpm = "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1";
    const aeroNpm = "0xe1f8cd9AC4e4A65F54f38a5CdAfCA44f6dD68b53";
    expect(await ethers.provider.getCode(uniFactory)).to.not.equal("0x");
    expect(await ethers.provider.getCode(aeroFactory)).to.not.equal("0x");
    expect(await ethers.provider.getCode(uniNpm)).to.not.equal("0x");
    expect(await ethers.provider.getCode(aeroNpm)).to.not.equal("0x");
  });
});
