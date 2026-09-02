const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { activateStep2PoolWithGovernance, impersonateTimelock } = require("../../scripts/stable-club/governance-activation-local.cjs");

const POOL_ID = ethers.keccak256(
  ethers.toUtf8Bytes("INDEXLA_STABLE_CLUB_BASE_USDC_cbBTC_AERO_CL100"),
);

const COMPOUND_ONLY_ACTIONS = 1n << 9n;

async function deployCompoundKeeperStack() {
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
    oracleGuard,
    btcFeed,
    timelockAddr,
  };
}

async function registerCompoundPermission(ctx, overrides = {}) {
  const perm = {
    user: ctx.user.address,
    chainId: (await ethers.provider.getNetwork()).chainId,
    poolId: POOL_ID,
    tokenA: await ctx.usdc.getAddress(),
    tokenB: await ctx.cbbtc.getAddress(),
    allowedActions: COMPOUND_ONLY_ACTIONS,
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

function compoundProposalIdFor(p) {
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
        "address",
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
        p.chainId,
        p.user,
        p.permissionId,
        p.poolId,
        p.adapter,
        p.positionTokenId,
        p.executionNonce,
        p.deadline,
        p.idempotencyKey,
        p.rewardToken,
        p.tokenA,
        p.tokenB,
        p.swapAmount,
        p.minAmountOut,
        p.quotedAmountOut,
        p.amountA,
        p.amountB,
        p.amountAMin,
        p.amountBMin,
        p.slippageBps,
        p.swapDeadline,
      ],
    ),
  );
}

async function buildCompoundProposal(ctx, permissionId, overrides = {}) {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const latest = await time.latest();
  const usdcAddr = await ctx.usdc.getAddress();
  const cbbtcAddr = await ctx.cbbtc.getAddress();
  const base = {
    chainId,
    user: ctx.user.address,
    permissionId,
    poolId: POOL_ID,
    adapter: await ctx.clAdapter.getAddress(),
    positionTokenId: 1n,
    executionNonce: 501n,
    deadline: BigInt(latest + 3600),
    idempotencyKey: ethers.id(`compound-idem-${overrides.executionNonce ?? 501}`),
    rewardToken: usdcAddr,
    tokenA: usdcAddr,
    tokenB: cbbtcAddr,
    swapAmount: 0n,
    minAmountOut: 0n,
    quotedAmountOut: 0n,
    amountA: 1_000_000n,
    amountB: 1_000_000n,
    amountAMin: 1n,
    amountBMin: 1n,
    slippageBps: 150n,
    swapDeadline: BigInt(latest + 1800),
  };
  const proposal = { ...base, ...overrides };
  if (overrides.idempotencyKey === undefined && overrides.executionNonce !== undefined) {
    proposal.idempotencyKey = ethers.id(`compound-idem-${overrides.executionNonce}`);
  }
  return proposal;
}

async function submitCompoundProposal(ctx, permissionId, overrides = {}) {
  const proposal = await buildCompoundProposal(ctx, permissionId, overrides);
  const proposalId = compoundProposalIdFor(proposal);
  await ctx.gate.submitCompoundProposal(proposal);
  return { proposalId, proposal };
}

describe("Stable Club keeper compound (Phase 2)", function () {
  it("keeper success compounds atomically and consumes proposal", async function () {
    const ctx = await deployCompoundKeeperStack();
    const permissionId = await registerCompoundPermission(ctx);
    await mintPositionViaExecutor(ctx);
    await ctx.clAdapter.setCollectFeeAmounts(1_000_000n, 1_000_000n);
    const { proposalId } = await submitCompoundProposal(ctx, permissionId);

    const preExecUsdc = await ctx.usdc.balanceOf(await ctx.automation.getAddress());
    const keeperBefore = await ctx.usdc.balanceOf(ctx.keeper.address);
    await ctx.automation.connect(ctx.keeper).executeCompoundProposal(proposalId);
    const keeperAfter = await ctx.usdc.balanceOf(ctx.keeper.address);

    expect(keeperAfter).to.equal(keeperBefore);
    expect(await ctx.usdc.balanceOf(await ctx.automation.getAddress())).to.equal(preExecUsdc);
    expect(await ctx.cbbtc.balanceOf(await ctx.automation.getAddress())).to.equal(0n);
    expect((await ctx.gate.getCompoundProposal(proposalId)).consumed).to.equal(true);
  });

  it("manual compound remains user-only; keeper cannot call compound()", async function () {
    const ctx = await deployCompoundKeeperStack();
    const permissionId = await registerCompoundPermission(ctx);
    const tokenId = await mintPositionViaExecutor(ctx);
    await ctx.clAdapter.setCollectFeeAmounts(1_000_000n, 1_000_000n);

    await expect(
      ctx.automation.connect(ctx.keeper).compound(
        permissionId,
        601n,
        await ctx.clAdapter.getAddress(),
        tokenId,
        await ctx.usdc.getAddress(),
        await ctx.usdc.getAddress(),
        await ctx.cbbtc.getAddress(),
        0n,
        0n,
        1_000_000n,
        1_000_000n,
        1n,
        1n,
        150n,
        BigInt((await time.latest()) + 600),
        0n,
      ),
    ).to.be.reverted;

    const preUsdc = await ctx.usdc.balanceOf(await ctx.automation.getAddress());
    await ctx.automation.connect(ctx.user).compound(
      permissionId,
      602n,
      await ctx.clAdapter.getAddress(),
      tokenId,
      await ctx.usdc.getAddress(),
      await ctx.usdc.getAddress(),
      await ctx.cbbtc.getAddress(),
      0n,
      0n,
      1_000_000n,
      1_000_000n,
      1n,
      1n,
      150n,
      BigInt((await time.latest()) + 600),
      0n,
    );
    expect(await ctx.usdc.balanceOf(await ctx.automation.getAddress())).to.equal(preUsdc);
  });

  it("rejects unauthorized and revoked keeper", async function () {
    const ctx = await deployCompoundKeeperStack();
    const permissionId = await registerCompoundPermission(ctx);
    await mintPositionViaExecutor(ctx);
    const { proposalId } = await submitCompoundProposal(ctx, permissionId, { executionNonce: 503n });

    await expect(
      ctx.automation.connect(ctx.other).executeCompoundProposal(proposalId),
    ).to.be.revertedWithCustomError(ctx.automation, "KeeperNotAuthorized");

    await ctx.automation.connect(await impersonateTimelock(ctx.timelockAddr)).setAuthorizedKeeper(ctx.keeper.address, false);
    await expect(
      ctx.automation.connect(ctx.keeper).executeCompoundProposal(proposalId),
    ).to.be.revertedWithCustomError(ctx.automation, "KeeperNotAuthorized");
  });

  it("rejects wrong proposal bindings and adapter mismatch", async function () {
    const ctx = await deployCompoundKeeperStack();
    const permissionId = await registerCompoundPermission(ctx);
    await mintPositionViaExecutor(ctx);

    const wrongUser = await submitCompoundProposal(ctx, permissionId, {
      executionNonce: 504n,
      user: ctx.other.address,
    });
    await expect(
      ctx.automation.connect(ctx.keeper).executeCompoundProposal(wrongUser.proposalId),
    ).to.be.revertedWithCustomError(ctx.automation, "ProposalBindingMismatch");

    const wrongPool = await submitCompoundProposal(ctx, permissionId, {
      executionNonce: 505n,
      poolId: ethers.id("WRONG_POOL"),
    });
    await expect(
      ctx.automation.connect(ctx.keeper).executeCompoundProposal(wrongPool.proposalId),
    ).to.be.revertedWithCustomError(ctx.automation, "ProposalBindingMismatch");

    const otherAdapter = await ethers.deployContract("MockConcentratedLiquidityAdapter", [
      await ctx.automation.getAddress(),
      ethers.id("OTHER"),
      "uniswap-v3",
    ]);
    const wrongAdapter = await submitCompoundProposal(ctx, permissionId, {
      executionNonce: 506n,
      adapter: await otherAdapter.getAddress(),
    });
    await expect(
      ctx.automation.connect(ctx.keeper).executeCompoundProposal(wrongAdapter.proposalId),
    ).to.be.revertedWithCustomError(ctx.automation, "ProposalAdapterMismatch");
  });

  it("rejects expired proposal deadline", async function () {
    const ctx = await deployCompoundKeeperStack();
    const permissionId = await registerCompoundPermission(ctx);
    await mintPositionViaExecutor(ctx);
    const latest = await time.latest();
    const { proposalId } = await submitCompoundProposal(ctx, permissionId, {
      executionNonce: 507n,
      deadline: BigInt(latest + 100),
    });
    await time.increase(101);
    await expect(
      ctx.automation.connect(ctx.keeper).executeCompoundProposal(proposalId),
    ).to.be.revertedWithCustomError(ctx.automation, "ProposalExpired");
  });

  it("rejects replayed execution nonce and single-consumption", async function () {
    const ctx = await deployCompoundKeeperStack();
    const permissionId = await registerCompoundPermission(ctx);
    await mintPositionViaExecutor(ctx);
    await ctx.clAdapter.setCollectFeeAmounts(1_000_000n, 1_000_000n);

    const first = await submitCompoundProposal(ctx, permissionId, { executionNonce: 508n });
    await ctx.automation.connect(ctx.keeper).executeCompoundProposal(first.proposalId);

    await expect(
      ctx.automation.connect(ctx.keeper).executeCompoundProposal(first.proposalId),
    ).to.be.revertedWithCustomError(ctx.automation, "ProposalAlreadyHandled");

    const replay = await submitCompoundProposal(ctx, permissionId, {
      executionNonce: 508n,
      idempotencyKey: ethers.id("compound-replay-508"),
    });
    await expect(
      ctx.automation.connect(ctx.keeper).executeCompoundProposal(replay.proposalId),
    ).to.be.revertedWithCustomError(ctx.permissionRegistry, "ExecutionNonceAlreadyUsed");
    expect((await ctx.gate.getCompoundProposal(replay.proposalId)).consumed).to.equal(false);
  });

  it("rejects automation pause, permission pause, and missing NFT approval", async function () {
    const ctx = await deployCompoundKeeperStack();
    const permissionId = await registerCompoundPermission(ctx);
    await mintPositionViaExecutor(ctx);

    const paused = await submitCompoundProposal(ctx, permissionId, { executionNonce: 509n });
    await ctx.safetyController.setPoolAutomationPaused(POOL_ID, true);
    await expect(
      ctx.automation.connect(ctx.keeper).executeCompoundProposal(paused.proposalId),
    ).to.be.revertedWithCustomError(ctx.safetyController, "AutomationPaused");
    expect((await ctx.gate.getCompoundProposal(paused.proposalId)).consumed).to.equal(false);

    const ctx2 = await deployCompoundKeeperStack();
    const permissionId2 = await registerCompoundPermission(ctx2);
    await mintPositionViaExecutor(ctx2, { approveAdapter: false });
    const noApproval = await submitCompoundProposal(ctx2, permissionId2, { executionNonce: 510n });
    await expect(
      ctx2.automation.connect(ctx2.keeper).executeCompoundProposal(noApproval.proposalId),
    ).to.be.revertedWithCustomError(ctx2.automation, "PositionApprovalRequired");
    expect((await ctx2.gate.getCompoundProposal(noApproval.proposalId)).consumed).to.equal(false);

    const ctx3 = await deployCompoundKeeperStack();
    const permissionId3 = await registerCompoundPermission(ctx3);
    await mintPositionViaExecutor(ctx3);
    await ctx3.permissionRegistry.connect(ctx3.user).pause(permissionId3);
    const permPaused = await submitCompoundProposal(ctx3, permissionId3, { executionNonce: 511n });
    await expect(
      ctx3.automation.connect(ctx3.keeper).executeCompoundProposal(permPaused.proposalId),
    ).to.be.revertedWithCustomError(ctx3.permissionRegistry, "PausedPermission");
    expect((await ctx3.gate.getCompoundProposal(permPaused.proposalId)).consumed).to.equal(false);
  });

  it("rejects spend above collected balance delta", async function () {
    const ctx = await deployCompoundKeeperStack();
    const permissionId = await registerCompoundPermission(ctx);
    await mintPositionViaExecutor(ctx);
    await ctx.clAdapter.setCollectFeeAmounts(1_000_000n, 1_000_000n);

    const overSpend = await submitCompoundProposal(ctx, permissionId, {
      executionNonce: 512n,
      amountA: 5_000_000n,
    });
    await expect(
      ctx.automation.connect(ctx.keeper).executeCompoundProposal(overSpend.proposalId),
    ).to.be.revertedWithCustomError(ctx.automation, "ExceedsCollectedFees");
    expect((await ctx.gate.getCompoundProposal(overSpend.proposalId)).consumed).to.equal(false);
  });

  it("rejects harvest-only permission missing compound bit", async function () {
    const ctx = await deployCompoundKeeperStack();
    const perm = {
      user: ctx.user.address,
      chainId: (await ethers.provider.getNetwork()).chainId,
      poolId: POOL_ID,
      tokenA: await ctx.usdc.getAddress(),
      tokenB: await ctx.cbbtc.getAddress(),
      allowedActions: 1n << 8n,
      maxAmountPerTx: 0n,
      maxAmountPerDay: 0n,
      maxSlippageBps: 500n,
      minTimeBetweenExecutions: 0n,
      maxExecutionsPerDay: 50n,
      expiresAt: BigInt((await time.latest()) + 86400),
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
    await mintPositionViaExecutor(ctx);
    await ctx.clAdapter.setCollectFeeAmounts(1_000_000n, 1_000_000n);
    const { proposalId } = await submitCompoundProposal(ctx, permissionId, { executionNonce: 513n });
    await expect(
      ctx.automation.connect(ctx.keeper).executeCompoundProposal(proposalId),
    ).to.be.revertedWithCustomError(ctx.permissionRegistry, "ActionNotAllowed");
  });

  it("reverts on bad swap quote without consuming proposal", async function () {
    const ctx = await deployCompoundKeeperStack();
    const permissionId = await registerCompoundPermission(ctx);
    await mintPositionViaExecutor(ctx);
    const usdcAddr = await ctx.usdc.getAddress();
    const [t0] = await ctx.clAdapter.positionTokens(1n);
    if (t0 === usdcAddr) {
      await ctx.clAdapter.setCollectFeeAmounts(ethers.parseUnits("50", 6), 0n);
    } else {
      await ctx.clAdapter.setCollectFeeAmounts(0n, ethers.parseUnits("50", 6));
    }
    await ctx.btcFeed.setAnswer(100_00000000n);
    const swapAmount = ethers.parseUnits("10", 6);
    const net = (swapAmount * 99n) / 100n;
    const expected = await ctx.oracleGuard.expectedAmountOut(usdcAddr, await ctx.cbbtc.getAddress(), net, 6, 8);
    const minOut = (expected * 9850n) / 10000n;

    const { proposalId } = await submitCompoundProposal(ctx, permissionId, {
      executionNonce: 514n,
      swapAmount,
      minAmountOut: minOut,
      quotedAmountOut: 1n,
      amountA: 0n,
      amountB: 0n,
      amountAMin: 0n,
      amountBMin: minOut,
    });
    await expect(
      ctx.automation.connect(ctx.keeper).executeCompoundProposal(proposalId),
    ).to.be.reverted;
    expect((await ctx.gate.getCompoundProposal(proposalId)).consumed).to.equal(false);
  });

  it("does not consume proposal when execution reverts (revoked permission)", async function () {
    const ctx = await deployCompoundKeeperStack();
    const permissionId = await registerCompoundPermission(ctx);
    await mintPositionViaExecutor(ctx);
    const { proposalId } = await submitCompoundProposal(ctx, permissionId, { executionNonce: 515n });
    await ctx.permissionRegistry.connect(ctx.user).revoke(permissionId);
    await expect(
      ctx.automation.connect(ctx.keeper).executeCompoundProposal(proposalId),
    ).to.be.reverted;
    expect((await ctx.gate.getCompoundProposal(proposalId)).consumed).to.equal(false);
  });
});

describe("OpenServ compound proposal gate (Phase 2 binding)", function () {
  it("stores bound compound fields and rejects invalid submit params", async function () {
    const ctx = await deployCompoundKeeperStack();
    const permissionId = await registerCompoundPermission(ctx);
    const proposal = await buildCompoundProposal(ctx, permissionId, { executionNonce: 601n });
    const proposalId = compoundProposalIdFor(proposal);
    await ctx.gate.submitCompoundProposal(proposal);
    const stored = await ctx.gate.getCompoundProposal(proposalId);
    expect(stored.chainId).to.equal(proposal.chainId);
    expect(stored.user).to.equal(proposal.user);
    expect(stored.permissionId).to.equal(permissionId);
    expect(stored.poolId).to.equal(POOL_ID);
    expect(stored.adapter).to.equal(proposal.adapter);
    expect(stored.positionTokenId).to.equal(1n);
    expect(stored.executionNonce).to.equal(601n);
    expect(stored.rewardToken).to.equal(proposal.rewardToken);
    expect(stored.amountA).to.equal(1_000_000n);
    expect(stored.slippageBps).to.equal(150n);

    const bad = {
      ...proposal,
      executionNonce: 0n,
      idempotencyKey: ethers.id("compound-bad-nonce"),
    };
    await expect(ctx.gate.submitCompoundProposal(bad)).to.be.revertedWithCustomError(
      ctx.gate,
      "InvalidProposalParams",
    );
  });
});
