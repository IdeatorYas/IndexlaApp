const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployStableClubStack, POOL_ID: STEP1_POOL_ID, approvePermit2Pull } = require("../../scripts/stable-club/deploy-local.cjs");
const { activateStep2PoolWithGovernance, impersonateTimelock } = require("../../scripts/stable-club/governance-activation-local.cjs");

const POOL_ID = ethers.keccak256(
  ethers.toUtf8Bytes("INDEXLA_STABLE_CLUB_BASE_USDC_cbBTC_AERO_CL100"),
);

const HARVEST_ONLY_ACTIONS = 1n << 8n;
const HARVEST_ACTION = 0;

async function deployHarvestStack() {
  const [deployer, user, other, keeper] = await ethers.getSigners();
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

  const gate = await ethers.deployContract("OpenServProposalGate");
  await automation.setProposalGate(await gate.getAddress());
  await gate.wireAutomationExecutor(await automation.getAddress());
  await automation.setAuthorizedKeeper(keeper.address, true);

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
  const { timelockAddr } = await activateStep2PoolWithGovernance({
    automation,
    permissionRegistry,
    feeRouter,
    oracleGuard,
    mevGuard,
    safetyController,
    openServGate: gate,
    poolId: POOL_ID,
    signers: signers.slice(0, 3),
  });

  await usdc.mint(user.address, ethers.parseUnits("10000", 6));
  await cbbtc.mint(user.address, ethers.parseUnits("1", 8));
  await usdc.mint(await clAdapter.getAddress(), ethers.parseUnits("10000", 6));
  await cbbtc.mint(await clAdapter.getAddress(), ethers.parseUnits("1", 8));

  return {
    deployer,
    user,
    other,
    keeper,
    permissionRegistry,
    safetyController,
    automation,
    gate,
    clAdapter,
    usdc,
    cbbtc,
    timelockAddr,
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

function proposalIdFor(p) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      [
        "uint256",
        "address",
        "bytes32",
        "bytes32",
        "address",
        "uint256",
        "uint8",
        "uint256",
        "uint256",
        "bytes32",
      ],
      [
        p.chainId,
        p.user,
        p.permissionId,
        p.poolId,
        p.adapter,
        p.positionTokenId,
        p.action,
        p.executionNonce,
        p.deadline,
        p.idempotencyKey,
      ],
    ),
  );
}

async function buildHarvestProposal(ctx, permissionId, overrides = {}) {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const latest = await time.latest();
  const adapter = await ctx.clAdapter.getAddress();
  const base = {
    chainId,
    user: ctx.user.address,
    permissionId,
    poolId: POOL_ID,
    adapter,
    positionTokenId: 1n,
    action: HARVEST_ACTION,
    executionNonce: 201n,
    deadline: BigInt(latest + 3600),
    idempotencyKey: ethers.id(`keeper-idem-${overrides.executionNonce ?? 201}`),
    reasonCode: ethers.id("fees-exceed-gas"),
    observedValue: 25n,
  };
  const proposal = { ...base, ...overrides };
  if (overrides.idempotencyKey === undefined && overrides.executionNonce !== undefined) {
    proposal.idempotencyKey = ethers.id(`keeper-idem-${overrides.executionNonce}`);
  }
  return proposal;
}

async function submitHarvestProposal(ctx, permissionId, overrides = {}) {
  const proposal = await buildHarvestProposal(ctx, permissionId, overrides);
  const proposalId = proposalIdFor(proposal);
  await ctx.gate.submitProposal(proposal);
  return { proposalId, proposal };
}

describe("Stable Club keeper harvest (Phase 1)", function () {
  it("keeper success harvests to user and consumes proposal atomically", async function () {
    const ctx = await deployHarvestStack();
    const permissionId = await registerHarvestPermission(ctx);
    await mintPositionViaExecutor(ctx);
    const { proposalId } = await submitHarvestProposal(ctx, permissionId);

    const userBefore = await ctx.usdc.balanceOf(ctx.user.address);
    const keeperBefore = await ctx.usdc.balanceOf(ctx.keeper.address);
    await ctx.automation.connect(ctx.keeper).executeHarvestProposal(proposalId);
    const userAfter = await ctx.usdc.balanceOf(ctx.user.address);
    const keeperAfter = await ctx.usdc.balanceOf(ctx.keeper.address);

    expect(userAfter).to.be.gt(userBefore);
    expect(keeperAfter).to.equal(keeperBefore);
    const stored = await ctx.gate.getProposal(proposalId);
    expect(stored.consumed).to.equal(true);
  });

  it("rejects unauthorized and revoked keeper", async function () {
    const ctx = await deployHarvestStack();
    const permissionId = await registerHarvestPermission(ctx);
    await mintPositionViaExecutor(ctx);
    const { proposalId } = await submitHarvestProposal(ctx, permissionId, { executionNonce: 202n });

    await expect(
      ctx.automation.connect(ctx.other).executeHarvestProposal(proposalId),
    ).to.be.revertedWithCustomError(ctx.automation, "KeeperNotAuthorized");

    await ctx.automation.connect(await impersonateTimelock(ctx.timelockAddr)).setAuthorizedKeeper(ctx.keeper.address, false);
    await expect(
      ctx.automation.connect(ctx.keeper).executeHarvestProposal(proposalId),
    ).to.be.revertedWithCustomError(ctx.automation, "KeeperNotAuthorized");
  });

  it("rejects wrong proposal bindings and adapter mismatch", async function () {
    const ctx = await deployHarvestStack();
    const permissionId = await registerHarvestPermission(ctx);
    await mintPositionViaExecutor(ctx);

    const wrongUser = await submitHarvestProposal(ctx, permissionId, {
      executionNonce: 203n,
      user: ctx.other.address,
    });
    await expect(
      ctx.automation.connect(ctx.keeper).executeHarvestProposal(wrongUser.proposalId),
    ).to.be.revertedWithCustomError(ctx.automation, "ProposalBindingMismatch");

    const wrongPool = await submitHarvestProposal(ctx, permissionId, {
      executionNonce: 204n,
      poolId: ethers.id("WRONG_POOL"),
    });
    await expect(
      ctx.automation.connect(ctx.keeper).executeHarvestProposal(wrongPool.proposalId),
    ).to.be.revertedWithCustomError(ctx.automation, "ProposalBindingMismatch");

    const otherAdapter = await ethers.deployContract("MockConcentratedLiquidityAdapter", [
      await ctx.automation.getAddress(),
      ethers.id("OTHER"),
      "uniswap-v3",
    ]);
    const wrongAdapter = await submitHarvestProposal(ctx, permissionId, {
      executionNonce: 205n,
      adapter: await otherAdapter.getAddress(),
    });
    await expect(
      ctx.automation.connect(ctx.keeper).executeHarvestProposal(wrongAdapter.proposalId),
    ).to.be.revertedWithCustomError(ctx.automation, "ProposalAdapterMismatch");
  });

  it("rejects expired proposal deadline", async function () {
    const ctx = await deployHarvestStack();
    const permissionId = await registerHarvestPermission(ctx);
    await mintPositionViaExecutor(ctx);
    const latest = await time.latest();
    const { proposalId } = await submitHarvestProposal(ctx, permissionId, {
      executionNonce: 206n,
      deadline: BigInt(latest + 100),
    });
    await time.increase(101);
    await expect(
      ctx.automation.connect(ctx.keeper).executeHarvestProposal(proposalId),
    ).to.be.revertedWithCustomError(ctx.automation, "ProposalExpired");
  });

  it("rejects replayed execution nonce and single-consumption", async function () {
    const ctx = await deployHarvestStack();
    const permissionId = await registerHarvestPermission(ctx);
    await mintPositionViaExecutor(ctx);

    const first = await submitHarvestProposal(ctx, permissionId, { executionNonce: 207n });
    await ctx.automation.connect(ctx.keeper).executeHarvestProposal(first.proposalId);

    await expect(
      ctx.automation.connect(ctx.keeper).executeHarvestProposal(first.proposalId),
    ).to.be.revertedWithCustomError(ctx.automation, "ProposalAlreadyHandled");

    const replay = await submitHarvestProposal(ctx, permissionId, {
      executionNonce: 207n,
      idempotencyKey: ethers.id("replay-nonce-207"),
    });
    await expect(
      ctx.automation.connect(ctx.keeper).executeHarvestProposal(replay.proposalId),
    ).to.be.revertedWithCustomError(ctx.permissionRegistry, "ExecutionNonceAlreadyUsed");
    const replayStored = await ctx.gate.getProposal(replay.proposalId);
    expect(replayStored.consumed).to.equal(false);
  });

  it("rejects automation pause and missing NFT approval", async function () {
    const ctx = await deployHarvestStack();
    const permissionId = await registerHarvestPermission(ctx);
    await mintPositionViaExecutor(ctx);

    const paused = await submitHarvestProposal(ctx, permissionId, { executionNonce: 208n });
    await ctx.safetyController.setPoolAutomationPaused(POOL_ID, true);
    await expect(
      ctx.automation.connect(ctx.keeper).executeHarvestProposal(paused.proposalId),
    ).to.be.revertedWithCustomError(ctx.safetyController, "AutomationPaused");
    expect((await ctx.gate.getProposal(paused.proposalId)).consumed).to.equal(false);

    const ctx2 = await deployHarvestStack();
    const permissionId2 = await registerHarvestPermission(ctx2);
    await mintPositionViaExecutor(ctx2, { approveAdapter: false });
    const noApproval = await submitHarvestProposal(ctx2, permissionId2, { executionNonce: 209n });
    await expect(
      ctx2.automation.connect(ctx2.keeper).executeHarvestProposal(noApproval.proposalId),
    ).to.be.revertedWithCustomError(ctx2.automation, "PositionApprovalRequired");
    expect((await ctx2.gate.getProposal(noApproval.proposalId)).consumed).to.equal(false);
  });

  it("does not consume proposal when harvest reverts (revoked permission)", async function () {
    const ctx = await deployHarvestStack();
    const permissionId = await registerHarvestPermission(ctx);
    await mintPositionViaExecutor(ctx);
    const { proposalId } = await submitHarvestProposal(ctx, permissionId, { executionNonce: 210n });

    await ctx.permissionRegistry.connect(ctx.user).revoke(permissionId);
    await expect(
      ctx.automation.connect(ctx.keeper).executeHarvestProposal(proposalId),
    ).to.be.reverted;
    expect((await ctx.gate.getProposal(proposalId)).consumed).to.equal(false);
  });

  it("manual harvest regression remains user-only", async function () {
    const ctx = await deployHarvestStack();
    const permissionId = await registerHarvestPermission(ctx);
    const tokenId = await mintPositionViaExecutor(ctx);

    await expect(
      ctx.automation.connect(ctx.keeper).harvest(
        permissionId,
        301n,
        await ctx.clAdapter.getAddress(),
        tokenId,
      ),
    ).to.be.reverted;

    const before = await ctx.usdc.balanceOf(ctx.user.address);
    await ctx.automation.connect(ctx.user).harvest(
      permissionId,
      301n,
      await ctx.clAdapter.getAddress(),
      tokenId,
    );
    expect(await ctx.usdc.balanceOf(ctx.user.address)).to.be.gt(before);
  });

  it("emergency exit path remains unchanged when permission revoked and paused", async function () {
    const ctx = await deployStableClubStack();
    const perm = {
      user: ctx.testUser.address,
      chainId: (await ethers.provider.getNetwork()).chainId,
      poolId: STEP1_POOL_ID,
      tokenA: ctx.usdc,
      tokenB: ctx.weth,
      allowedActions: (1n << 0n) | (1n << 4n) | (1n << 7n),
      maxAmountPerTx: ethers.parseUnits("5000", 6),
      maxAmountPerDay: ethers.parseUnits("20000", 6),
      maxSlippageBps: 500n,
      minTimeBetweenExecutions: 0n,
      maxExecutionsPerDay: 20n,
      expiresAt: BigInt((await time.latest()) + 86400 * 7),
      revoked: false,
      paused: false,
    };
    await ctx.permissionRegistryContract.connect(ctx.testUser).registerPermission(perm);
    const permissionId = await ctx.permissionRegistryContract.permissionIdFor(
      perm.user,
      perm.chainId,
      perm.poolId,
      perm.tokenA,
      perm.tokenB,
    );

    const deposit = ethers.parseUnits("400", 6);
    await approvePermit2Pull(ctx.usdcContract, ctx.testUser, ctx.permit2Contract, ctx.executor, deposit);
    await ctx.executorContract.connect(ctx.testUser).depositAndAddLiquidity(
      permissionId,
      1n,
      ctx.testAdapter,
      ctx.usdc,
      ctx.usdc,
      ctx.weth,
      deposit,
      0n,
      0n,
      1n,
      50n,
    );
    const lp = await ctx.testAdapterContract.balanceOf(ctx.testUser.address);

    await ctx.permissionRegistryContract.connect(ctx.testUser).revoke(permissionId);
    await ctx.permissionRegistryContract.connect(ctx.testUser).pause(permissionId);

    const minA = lp / 2n;
    const minB = lp - minA;
    await ctx.testAdapterContract.connect(ctx.testUser).approve(ctx.executor, lp);
    await ctx.executorContract.connect(ctx.testUser).emergencyExit(
      permissionId,
      99n,
      ctx.testAdapter,
      ctx.usdc,
      ctx.weth,
      lp,
      minA > 0n ? minA : 1n,
      minB > 0n ? minB : 1n,
    );
    expect(await ctx.usdcContract.balanceOf(ctx.executor)).to.equal(0n);
  });
});

describe("OpenServ proposal gate (Phase 1 harvest binding)", function () {
  it("stores bound fields and rejects invalid submit params", async function () {
    const ctx = await deployHarvestStack();
    const permissionId = await registerHarvestPermission(ctx);
    const proposal = await buildHarvestProposal(ctx, permissionId, { executionNonce: 401n });
    const proposalId = proposalIdFor(proposal);
    await ctx.gate.submitProposal(proposal);
    const stored = await ctx.gate.getProposal(proposalId);
    expect(stored.chainId).to.equal(proposal.chainId);
    expect(stored.user).to.equal(proposal.user);
    expect(stored.permissionId).to.equal(permissionId);
    expect(stored.poolId).to.equal(POOL_ID);
    expect(stored.adapter).to.equal(proposal.adapter);
    expect(stored.positionTokenId).to.equal(1n);
    expect(stored.action).to.equal(HARVEST_ACTION);
    expect(stored.executionNonce).to.equal(401n);
    expect(stored.deadline).to.equal(proposal.deadline);
    expect(stored.idempotencyKey).to.equal(proposal.idempotencyKey);

    const bad = { ...proposal, executionNonce: 0n, idempotencyKey: ethers.id("bad-nonce") };
    await expect(ctx.gate.submitProposal(bad)).to.be.revertedWithCustomError(
      ctx.gate,
      "InvalidProposalParams",
    );
  });
});
