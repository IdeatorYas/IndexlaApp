const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const POOL_ID = ethers.keccak256(
  ethers.toUtf8Bytes("INDEXLA_STABLE_CLUB_BASE_USDC_cbBTC_AERO_CL100"),
);
const REBALANCE_ACTION = 1n << 10n;
const HARVEST_ACTION = 1n << 8n;

async function deployRebalanceKeeperStack() {
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
  await automation.activateOfficialPool(POOL_ID);
  await automation.setTokenApproval(await usdc.getAddress(), true);
  await automation.setTokenApproval(await cbbtc.getAddress(), true);

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
  };
}

async function registerRebalancePermission(ctx, overrides = {}) {
  const permission = {
    user: ctx.user.address,
    chainId: (await ethers.provider.getNetwork()).chainId,
    poolId: POOL_ID,
    tokenA: await ctx.usdc.getAddress(),
    tokenB: await ctx.cbbtc.getAddress(),
    allowedActions: REBALANCE_ACTION,
    maxAmountPerTx: ethers.parseUnits("50000", 6),
    maxAmountPerDay: ethers.parseUnits("200000", 6),
    maxSlippageBps: 500n,
    minTimeBetweenExecutions: 0n,
    maxExecutionsPerDay: 50n,
    expiresAt: BigInt((await time.latest()) + 86400),
    revoked: false,
    paused: false,
    ...overrides,
  };
  await ctx.permissionRegistry.connect(ctx.user).registerPermission(permission);
  return ctx.permissionRegistry.permissionIdFor(
    permission.user,
    permission.chainId,
    permission.poolId,
    permission.tokenA,
    permission.tokenB,
  );
}

async function mintPositionViaExecutor(ctx, { approveAdapter = true } = {}) {
  const executor = await ctx.automation.getAddress();
  await ethers.provider.send("hardhat_impersonateAccount", [executor]);
  await ethers.provider.send("hardhat_setBalance", [
    executor,
    ethers.toQuantity(ethers.parseEther("1")),
  ]);
  const executorSigner = await ethers.getSigner(executor);
  const amountA = ethers.parseUnits("200", 6);
  const amountB = ethers.parseUnits("0.2", 8);
  await ctx.usdc.connect(ctx.user).transfer(executor, amountA);
  await ctx.cbbtc.connect(ctx.user).transfer(executor, amountB);
  await ctx.usdc.connect(executorSigner).approve(await ctx.clAdapter.getAddress(), amountA);
  await ctx.cbbtc.connect(executorSigner).approve(await ctx.clAdapter.getAddress(), amountB);
  await ctx.clAdapter.connect(executorSigner).mintPosition(
    ctx.user.address,
    await ctx.usdc.getAddress(),
    await ctx.cbbtc.getAddress(),
    -100000,
    -90000,
    amountA,
    amountB,
    1n,
    1n,
  );
  const tokenId = 1n;
  if (approveAdapter) {
    await ctx.clAdapter.connect(ctx.user).approve(await ctx.clAdapter.getAddress(), tokenId);
  }
  return tokenId;
}

function rebalanceProposalIdFor(proposal) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      [
        "uint256",
        "address",
        "bytes32",
        "bytes32",
        "address",
        "uint256",
        "uint256",
        "uint256",
        "bytes32",
        "address",
        "address",
        "int24",
        "int24",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
      ],
      [
        proposal.chainId,
        proposal.user,
        proposal.permissionId,
        proposal.poolId,
        proposal.adapter,
        proposal.positionTokenId,
        proposal.executionNonce,
        proposal.deadline,
        proposal.idempotencyKey,
        proposal.tokenA,
        proposal.tokenB,
        proposal.newTickLower,
        proposal.newTickUpper,
        proposal.swapAmount,
        proposal.minAmountOut,
        proposal.quotedAmountOut,
        proposal.closeAmountAMin,
        proposal.closeAmountBMin,
        proposal.mintAmountAMin,
        proposal.mintAmountBMin,
        proposal.slippageBps,
        proposal.swapDeadline,
      ],
    ),
  );
}

async function buildRebalanceProposal(ctx, permissionId, overrides = {}) {
  const latest = await time.latest();
  const proposal = {
    chainId: (await ethers.provider.getNetwork()).chainId,
    user: ctx.user.address,
    permissionId,
    poolId: POOL_ID,
    adapter: await ctx.clAdapter.getAddress(),
    positionTokenId: 1n,
    executionNonce: 501n,
    deadline: BigInt(latest + 3600),
    idempotencyKey: ethers.id(`rebalance-idem-${overrides.executionNonce ?? 501}`),
    tokenA: await ctx.usdc.getAddress(),
    tokenB: await ctx.cbbtc.getAddress(),
    newTickLower: -90000,
    newTickUpper: -80000,
    swapAmount: 0n,
    minAmountOut: 0n,
    quotedAmountOut: 0n,
    closeAmountAMin: 1n,
    closeAmountBMin: 1n,
    mintAmountAMin: 1n,
    mintAmountBMin: 1n,
    slippageBps: 150n,
    swapDeadline: BigInt(latest + 1800),
    ...overrides,
  };
  if (overrides.idempotencyKey === undefined && overrides.executionNonce !== undefined) {
    proposal.idempotencyKey = ethers.id(`rebalance-idem-${overrides.executionNonce}`);
  }
  return proposal;
}

async function submitRebalanceProposal(ctx, permissionId, overrides = {}) {
  const proposal = await buildRebalanceProposal(ctx, permissionId, overrides);
  const proposalId = rebalanceProposalIdFor(proposal);
  await ctx.gate.submitRebalanceProposal(proposal);
  return { proposal, proposalId };
}

async function manualRebalance(ctx, caller, permissionId, executionNonce = 601n) {
  return ctx.automation.connect(caller).rebalance(
    permissionId,
    executionNonce,
    await ctx.clAdapter.getAddress(),
    1n,
    await ctx.usdc.getAddress(),
    await ctx.cbbtc.getAddress(),
    -90000,
    -80000,
    0n,
    0n,
    1n,
    1n,
    1n,
    1n,
    150n,
    BigInt((await time.latest()) + 600),
    0n,
  );
}

describe("Stable Club keeper rebalance", function () {
  it("executes an atomic rebalance and consumes the proposal", async function () {
    const ctx = await deployRebalanceKeeperStack();
    const permissionId = await registerRebalancePermission(ctx);
    await mintPositionViaExecutor(ctx);
    const { proposalId } = await submitRebalanceProposal(ctx, permissionId);

    await ctx.automation.connect(ctx.keeper).executeRebalanceProposal(proposalId);

    expect((await ctx.gate.getRebalanceProposal(proposalId)).consumed).to.equal(true);
    expect(await ctx.clAdapter.ownerOf(2n)).to.equal(ctx.user.address);
    expect(await ctx.usdc.balanceOf(await ctx.automation.getAddress())).to.equal(0n);
    expect(await ctx.cbbtc.balanceOf(await ctx.automation.getAddress())).to.equal(0n);
  });

  it("keeps manual rebalance user-only", async function () {
    const ctx = await deployRebalanceKeeperStack();
    const permissionId = await registerRebalancePermission(ctx);
    await mintPositionViaExecutor(ctx);

    await expect(
      manualRebalance(ctx, ctx.keeper, permissionId),
    ).to.be.revertedWithCustomError(ctx.permissionRegistry, "UnauthorizedUser");

    await manualRebalance(ctx, ctx.user, permissionId, 602n);
    expect(await ctx.clAdapter.ownerOf(2n)).to.equal(ctx.user.address);
  });

  it("rejects unauthorized and revoked keepers", async function () {
    const ctx = await deployRebalanceKeeperStack();
    const permissionId = await registerRebalancePermission(ctx);
    await mintPositionViaExecutor(ctx);
    const { proposalId } = await submitRebalanceProposal(ctx, permissionId, { executionNonce: 503n });

    await expect(
      ctx.automation.connect(ctx.other).executeRebalanceProposal(proposalId),
    ).to.be.revertedWithCustomError(ctx.automation, "KeeperNotAuthorized");

    await ctx.automation.setAuthorizedKeeper(ctx.keeper.address, false);
    await expect(
      ctx.automation.connect(ctx.keeper).executeRebalanceProposal(proposalId),
    ).to.be.revertedWithCustomError(ctx.automation, "KeeperNotAuthorized");
  });

  it("rejects wrong bindings and adapter mismatch", async function () {
    const ctx = await deployRebalanceKeeperStack();
    const permissionId = await registerRebalancePermission(ctx);
    await mintPositionViaExecutor(ctx);

    const wrongUser = await submitRebalanceProposal(ctx, permissionId, {
      executionNonce: 504n,
      user: ctx.other.address,
    });
    await expect(
      ctx.automation.connect(ctx.keeper).executeRebalanceProposal(wrongUser.proposalId),
    ).to.be.revertedWithCustomError(ctx.automation, "ProposalBindingMismatch");

    const wrongPool = await submitRebalanceProposal(ctx, permissionId, {
      executionNonce: 505n,
      poolId: ethers.id("WRONG_POOL"),
    });
    await expect(
      ctx.automation.connect(ctx.keeper).executeRebalanceProposal(wrongPool.proposalId),
    ).to.be.revertedWithCustomError(ctx.automation, "ProposalBindingMismatch");

    const otherAdapter = await ethers.deployContract("MockConcentratedLiquidityAdapter", [
      await ctx.automation.getAddress(),
      ethers.id("OTHER_POOL"),
      "uniswap-v3",
    ]);
    const wrongAdapter = await submitRebalanceProposal(ctx, permissionId, {
      executionNonce: 506n,
      adapter: await otherAdapter.getAddress(),
    });
    await expect(
      ctx.automation.connect(ctx.keeper).executeRebalanceProposal(wrongAdapter.proposalId),
    ).to.be.revertedWithCustomError(ctx.automation, "ProposalAdapterMismatch");
  });

  it("rejects an expired proposal deadline", async function () {
    const ctx = await deployRebalanceKeeperStack();
    const permissionId = await registerRebalancePermission(ctx);
    await mintPositionViaExecutor(ctx);
    const latest = await time.latest();
    const { proposalId } = await submitRebalanceProposal(ctx, permissionId, {
      executionNonce: 507n,
      deadline: BigInt(latest + 100),
    });
    await time.increase(101);

    await expect(
      ctx.automation.connect(ctx.keeper).executeRebalanceProposal(proposalId),
    ).to.be.revertedWithCustomError(ctx.automation, "ProposalExpired");
  });

  it("enforces single consumption and rejects replayed execution nonces", async function () {
    const ctx = await deployRebalanceKeeperStack();
    const permissionId = await registerRebalancePermission(ctx);
    await mintPositionViaExecutor(ctx);
    const first = await submitRebalanceProposal(ctx, permissionId, { executionNonce: 508n });
    await ctx.automation.connect(ctx.keeper).executeRebalanceProposal(first.proposalId);

    await expect(
      ctx.automation.connect(ctx.keeper).executeRebalanceProposal(first.proposalId),
    ).to.be.revertedWithCustomError(ctx.automation, "ProposalAlreadyHandled");

    await ctx.clAdapter.connect(ctx.user).approve(await ctx.clAdapter.getAddress(), 2n);
    const replay = await submitRebalanceProposal(ctx, permissionId, {
      executionNonce: 508n,
      positionTokenId: 2n,
      idempotencyKey: ethers.id("rebalance-replay-508"),
    });
    await expect(
      ctx.automation.connect(ctx.keeper).executeRebalanceProposal(replay.proposalId),
    ).to.be.revertedWithCustomError(ctx.permissionRegistry, "ExecutionNonceAlreadyUsed");
    expect((await ctx.gate.getRebalanceProposal(replay.proposalId)).consumed).to.equal(false);
  });

  it("rejects automation pause, permission pause, and missing NFT approval", async function () {
    const ctx = await deployRebalanceKeeperStack();
    const permissionId = await registerRebalancePermission(ctx);
    await mintPositionViaExecutor(ctx);
    const paused = await submitRebalanceProposal(ctx, permissionId, { executionNonce: 509n });
    await ctx.safetyController.setPoolAutomationPaused(POOL_ID, true);
    await expect(
      ctx.automation.connect(ctx.keeper).executeRebalanceProposal(paused.proposalId),
    ).to.be.revertedWithCustomError(ctx.safetyController, "AutomationPaused");
    expect((await ctx.gate.getRebalanceProposal(paused.proposalId)).consumed).to.equal(false);

    const ctx2 = await deployRebalanceKeeperStack();
    const permissionId2 = await registerRebalancePermission(ctx2);
    await mintPositionViaExecutor(ctx2, { approveAdapter: false });
    const noApproval = await submitRebalanceProposal(ctx2, permissionId2, { executionNonce: 510n });
    await expect(
      ctx2.automation.connect(ctx2.keeper).executeRebalanceProposal(noApproval.proposalId),
    ).to.be.revertedWithCustomError(ctx2.automation, "PositionApprovalRequired");
    expect((await ctx2.gate.getRebalanceProposal(noApproval.proposalId)).consumed).to.equal(false);

    const ctx3 = await deployRebalanceKeeperStack();
    const permissionId3 = await registerRebalancePermission(ctx3);
    await mintPositionViaExecutor(ctx3);
    await ctx3.permissionRegistry.connect(ctx3.user).pause(permissionId3);
    const permPaused = await submitRebalanceProposal(ctx3, permissionId3, { executionNonce: 511n });
    await expect(
      ctx3.automation.connect(ctx3.keeper).executeRebalanceProposal(permPaused.proposalId),
    ).to.be.revertedWithCustomError(ctx3.permissionRegistry, "PausedPermission");
    expect((await ctx3.gate.getRebalanceProposal(permPaused.proposalId)).consumed).to.equal(false);
  });

  it("rejects a harvest-only permission missing the rebalance bit", async function () {
    const ctx = await deployRebalanceKeeperStack();
    const permissionId = await registerRebalancePermission(ctx, {
      allowedActions: HARVEST_ACTION,
    });
    await mintPositionViaExecutor(ctx);
    const { proposalId } = await submitRebalanceProposal(ctx, permissionId, {
      executionNonce: 512n,
    });

    await expect(
      ctx.automation.connect(ctx.keeper).executeRebalanceProposal(proposalId),
    ).to.be.revertedWithCustomError(ctx.permissionRegistry, "ActionNotAllowed");
    expect((await ctx.gate.getRebalanceProposal(proposalId)).consumed).to.equal(false);
  });

  it("does not consume a proposal when execution reverts", async function () {
    const ctx = await deployRebalanceKeeperStack();
    const permissionId = await registerRebalancePermission(ctx);
    await mintPositionViaExecutor(ctx);
    const { proposalId } = await submitRebalanceProposal(ctx, permissionId, {
      executionNonce: 513n,
    });
    await ctx.permissionRegistry.connect(ctx.user).revoke(permissionId);

    await expect(
      ctx.automation.connect(ctx.keeper).executeRebalanceProposal(proposalId),
    ).to.be.revertedWithCustomError(ctx.permissionRegistry, "RevokedPermission");
    expect((await ctx.gate.getRebalanceProposal(proposalId)).consumed).to.equal(false);
  });
});
