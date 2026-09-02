const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const {
  setupGovernanceActivationForAutomation,
  impersonateTimelock,
} = require("../../scripts/stable-club/governance-activation-local.cjs");

const POOL_ID = ethers.keccak256(
  ethers.toUtf8Bytes("INDEXLA_STABLE_CLUB_BASE_USDC_cbBTC_AERO_CL100"),
);

function posKey(user, poolId, tokenId) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(["address", "bytes32", "uint256"], [user, poolId, tokenId]),
  );
}

async function impersonateOperator(contractAddr) {
  await ethers.provider.send("hardhat_impersonateAccount", [contractAddr]);
  await ethers.provider.send("hardhat_setBalance", [
    contractAddr,
    ethers.toQuantity(ethers.parseEther("1")),
  ]);
  return ethers.getSigner(contractAddr);
}

async function deployProposalAccountingStack() {
  const signers = await ethers.getSigners();
  const [deployer, user, keeper, attacker] = signers;

  const permissionRegistry = await ethers.deployContract("PermissionRegistry");
  const feeRouter = await ethers.deployContract("FeeRouter", [deployer.address]);
  const oracleGuard = await ethers.deployContract("OracleGuard");
  const safetyController = await ethers.deployContract("SafetyController");
  const mevGuard = await ethers.deployContract("MevGuard");
  const gate = await ethers.deployContract("OpenServProposalGate");
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
  await automation.setProposalGate(await gate.getAddress());
  await gate.wireAutomationExecutor(await automation.getAddress());
  await automation.setAuthorizedKeeper(keeper.address, true);
  await gate.setPublisher(deployer.address);

  const step1Executor = await ethers.deployContract("StableClubExecutor", [
    await permissionRegistry.getAddress(),
    await feeRouter.getAddress(),
  ]);
  await permissionRegistry.setOperator(await step1Executor.getAddress(), true);

  const { timelockAddr } = await setupGovernanceActivationForAutomation({
    automation,
    permissionRegistry,
    feeRouter,
    step1Executor,
    oracleGuard,
    mevGuard,
    safetyController,
    openServGate: gate,
    signers: signers.slice(0, 3),
  });

  const tlSigner = await impersonateTimelock(timelockAddr);

  const clAdapter = await ethers.deployContract("MockConcentratedLiquidityAdapter", [
    await automation.getAddress(),
    POOL_ID,
    "aerodrome-slipstream",
  ]);
  const adapterAddr = await clAdapter.getAddress();
  const usdc = await ethers.deployContract("MockERC20", ["USDC", "USDC", 6]);
  const cbbtc = await ethers.deployContract("MockERC20", ["cbBTC", "cbBTC", 8]);

  return {
    deployer,
    user,
    keeper,
    attacker,
    gate,
    automation,
    timelockAddr,
    tlSigner,
    adapterAddr,
    usdc,
    cbbtc,
  };
}

async function submitHarvestProposal(ctx, overrides = {}) {
  const latest = await time.latest();
  const proposal = {
    chainId: (await ethers.provider.getNetwork()).chainId,
    user: ctx.user.address,
    permissionId: ethers.ZeroHash,
    poolId: POOL_ID,
    adapter: overrides.adapter ?? ctx.adapterAddr,
    positionTokenId: 7n,
    action: 0,
    executionNonce: 1n,
    deadline: BigInt(latest + 600),
    idempotencyKey: ethers.id(`idem-${overrides.suffix ?? "a"}`),
    reasonCode: ethers.id("fees"),
    observedValue: 1n,
    ...overrides.body,
  };
  const id = await ctx.gate.submitProposal.staticCall(proposal);
  await ctx.gate.submitProposal(proposal);
  return { proposalId: id, posKey: posKey(ctx.user.address, POOL_ID, 7n) };
}

async function submitCompoundProposal(ctx, overrides = {}) {
  const latest = await time.latest();
  const usdc = overrides.usdc ?? ctx.usdc;
  const cbbtc = overrides.cbbtc ?? ctx.cbbtc;
  const input = {
    chainId: (await ethers.provider.getNetwork()).chainId,
    user: ctx.user.address,
    permissionId: ethers.ZeroHash,
    poolId: POOL_ID,
    adapter: overrides.adapter ?? ctx.adapterAddr,
    positionTokenId: 8n,
    executionNonce: 1n,
    deadline: BigInt(latest + 600),
    idempotencyKey: ethers.id(`cmp-${overrides.suffix ?? "a"}`),
    rewardToken: await usdc.getAddress(),
    tokenA: await usdc.getAddress(),
    tokenB: await cbbtc.getAddress(),
    swapAmount: 0n,
    minAmountOut: 0n,
    quotedAmountOut: 0n,
    amountA: 1n,
    amountB: 0n,
    amountAMin: 1n,
    amountBMin: 0n,
    slippageBps: 100n,
    swapDeadline: BigInt(latest + 300),
    ...overrides.body,
  };
  const id = await ctx.gate.submitCompoundProposal.staticCall(input);
  await ctx.gate.submitCompoundProposal(input);
  return { proposalId: id, posKey: posKey(ctx.user.address, POOL_ID, 8n) };
}

async function submitRebalanceProposal(ctx, overrides = {}) {
  const latest = await time.latest();
  const usdc = overrides.usdc ?? ctx.usdc;
  const cbbtc = overrides.cbbtc ?? ctx.cbbtc;
  const input = {
    chainId: (await ethers.provider.getNetwork()).chainId,
    user: ctx.user.address,
    permissionId: ethers.ZeroHash,
    poolId: POOL_ID,
    adapter: overrides.adapter ?? ctx.adapterAddr,
    positionTokenId: 9n,
    executionNonce: 1n,
    deadline: BigInt(latest + 600),
    idempotencyKey: ethers.id(`reb-${overrides.suffix ?? "a"}`),
    tokenA: await usdc.getAddress(),
    tokenB: await cbbtc.getAddress(),
    newTickLower: -100000,
    newTickUpper: -90000,
    swapAmount: 0n,
    minAmountOut: 0n,
    quotedAmountOut: 0n,
    closeAmountAMin: 1n,
    closeAmountBMin: 1n,
    mintAmountAMin: 1n,
    mintAmountBMin: 1n,
    slippageBps: 100n,
    swapDeadline: BigInt(latest + 300),
    ...overrides.body,
  };
  const id = await ctx.gate.submitRebalanceProposal.staticCall(input);
  await ctx.gate.submitRebalanceProposal(input);
  return { proposalId: id, posKey: posKey(ctx.user.address, POOL_ID, 9n) };
}

describe("OpenServ proposal accounting — adversarial regressions", function () {
  describe("terminal once + counter integrity (harvest)", function () {
    it("decrements positionProposalCount on reject and blocks double rejection", async function () {
      const ctx = await deployProposalAccountingStack();
      const { proposalId, posKey: key } = await submitHarvestProposal(ctx);

      expect(await ctx.gate.positionProposalCount(key)).to.equal(1n);
      await ctx.gate.connect(ctx.tlSigner).markRejected(proposalId, ethers.id("failed"));
      expect(await ctx.gate.positionProposalCount(key)).to.equal(0n);

      await expect(
        ctx.gate.connect(ctx.tlSigner).markRejected(proposalId, ethers.id("failed-again")),
      ).to.be.revertedWithCustomError(ctx.gate, "AlreadyHandled");
      expect(await ctx.gate.positionProposalCount(key)).to.equal(0n);
    });

    it("blocks unauthorized reject and keeps counters unchanged", async function () {
      const ctx = await deployProposalAccountingStack();
      const { proposalId, posKey: key } = await submitHarvestProposal(ctx);

      await expect(
        ctx.gate.connect(ctx.attacker).markRejected(proposalId, ethers.id("nope")),
      ).to.be.revertedWithCustomError(ctx.gate, "Unauthorized");
      expect(await ctx.gate.positionProposalCount(key)).to.equal(1n);
      expect(await ctx.gate.failedExecutionStreak()).to.equal(0n);
    });
  });

  describe("identical compound/rebalance rejection semantics", function () {
    it("compound reject decrements counter once and trips circuit on streak", async function () {
      const ctx = await deployProposalAccountingStack();
      const usdc = await ethers.deployContract("MockERC20", ["USDC", "USDC", 6]);
      const cbbtc = await ethers.deployContract("MockERC20", ["cbBTC", "cbBTC", 8]);
      await ctx.gate.connect(ctx.tlSigner).setLimits(10, 20, 2);

      const first = await submitCompoundProposal(ctx, { usdc, cbbtc, suffix: "1" });
      const second = await submitCompoundProposal(ctx, {
        usdc,
        cbbtc,
        suffix: "2",
        body: { executionNonce: 2n, idempotencyKey: ethers.id("cmp-2") },
      });

      expect(await ctx.gate.positionProposalCount(first.posKey)).to.equal(2n);
      await ctx.gate.connect(ctx.tlSigner).markCompoundRejected(first.proposalId, ethers.id("bad"));
      expect(await ctx.gate.positionProposalCount(first.posKey)).to.equal(1n);
      expect(await ctx.gate.failedExecutionStreak()).to.equal(1n);

      await ctx.gate.connect(ctx.tlSigner).markCompoundRejected(second.proposalId, ethers.id("bad"));
      expect(await ctx.gate.positionProposalCount(first.posKey)).to.equal(0n);
      expect(await ctx.gate.circuitBroken()).to.equal(true);

      await expect(
        ctx.gate.connect(ctx.tlSigner).markCompoundRejected(first.proposalId, ethers.id("replay")),
      ).to.be.revertedWithCustomError(ctx.gate, "AlreadyHandled");
    });

    it("rebalance reject decrements counter once and resets streak on consume", async function () {
      const ctx = await deployProposalAccountingStack();
      const usdc = await ethers.deployContract("MockERC20", ["USDC", "USDC", 6]);
      const cbbtc = await ethers.deployContract("MockERC20", ["cbBTC", "cbBTC", 8]);

      const { proposalId, posKey: key } = await submitRebalanceProposal(ctx, { usdc, cbbtc });
      await ctx.gate.connect(ctx.tlSigner).markRebalanceRejected(proposalId, ethers.id("bad"));
      expect(await ctx.gate.positionProposalCount(key)).to.equal(0n);
      expect(await ctx.gate.failedExecutionStreak()).to.equal(1n);

      const again = await submitRebalanceProposal(ctx, {
        usdc,
        cbbtc,
        suffix: "b",
        body: { executionNonce: 2n, idempotencyKey: ethers.id("reb-b") },
      });
      await ctx.gate.connect(ctx.tlSigner).markRebalanceRejected(again.proposalId, ethers.id("bad2"));
      expect(await ctx.gate.failedExecutionStreak()).to.equal(2n);

      const consume = await submitRebalanceProposal(ctx, {
        usdc,
        cbbtc,
        suffix: "c",
        body: { executionNonce: 3n, idempotencyKey: ethers.id("reb-c") },
      });
      const automationAddr = await ctx.automation.getAddress();
      await ethers.provider.send("hardhat_impersonateAccount", [automationAddr]);
      await ethers.provider.send("hardhat_setBalance", [
        automationAddr,
        ethers.toQuantity(ethers.parseEther("1")),
      ]);
      const automationSigner = await ethers.getSigner(automationAddr);
      await ctx.gate.connect(automationSigner).markRebalanceConsumedByExecutor(consume.proposalId);
      expect(await ctx.gate.failedExecutionStreak()).to.equal(0n);
    });
  });

  describe("expiry vs owner rejection (symmetric)", function () {
    it("harvest: expired proposal cannot be owner-rejected as failure", async function () {
      const ctx = await deployProposalAccountingStack();
      const { proposalId, posKey: key } = await submitHarvestProposal(ctx);
      await time.increase(601);

      await expect(
        ctx.gate.connect(ctx.tlSigner).markRejected(proposalId, ethers.id("late-reject")),
      ).to.be.revertedWithCustomError(ctx.gate, "ProposalExpired");
      expect(await ctx.gate.positionProposalCount(key)).to.equal(1n);
      expect(await ctx.gate.failedExecutionStreak()).to.equal(0n);

      await ctx.automation.connect(ctx.keeper).finalizeExpiredHarvestProposal(proposalId);
      expect(await ctx.gate.positionProposalCount(key)).to.equal(0n);
      expect(await ctx.gate.failedExecutionStreak()).to.equal(0n);
    });

    it("compound: expired proposal cannot be owner-rejected as failure", async function () {
      const ctx = await deployProposalAccountingStack();
      const usdc = await ethers.deployContract("MockERC20", ["USDC", "USDC", 6]);
      const cbbtc = await ethers.deployContract("MockERC20", ["cbBTC", "cbBTC", 8]);
      const { proposalId, posKey: key } = await submitCompoundProposal(ctx, { usdc, cbbtc });
      await time.increase(601);

      await expect(
        ctx.gate.connect(ctx.tlSigner).markCompoundRejected(proposalId, ethers.id("late-reject")),
      ).to.be.revertedWithCustomError(ctx.gate, "ProposalExpired");
      expect(await ctx.gate.positionProposalCount(key)).to.equal(1n);
      expect(await ctx.gate.failedExecutionStreak()).to.equal(0n);

      await ctx.automation.connect(ctx.keeper).finalizeExpiredCompoundProposal(proposalId);
      expect(await ctx.gate.positionProposalCount(key)).to.equal(0n);
    });

    it("rebalance: expired proposal cannot be owner-rejected as failure", async function () {
      const ctx = await deployProposalAccountingStack();
      const usdc = await ethers.deployContract("MockERC20", ["USDC", "USDC", 6]);
      const cbbtc = await ethers.deployContract("MockERC20", ["cbBTC", "cbBTC", 8]);
      const { proposalId, posKey: key } = await submitRebalanceProposal(ctx, { usdc, cbbtc });
      await time.increase(601);

      await expect(
        ctx.gate.connect(ctx.tlSigner).markRebalanceRejected(proposalId, ethers.id("late-reject")),
      ).to.be.revertedWithCustomError(ctx.gate, "ProposalExpired");
      expect(await ctx.gate.positionProposalCount(key)).to.equal(1n);
      expect(await ctx.gate.failedExecutionStreak()).to.equal(0n);

      await ctx.automation.connect(ctx.keeper).finalizeExpiredRebalanceProposal(proposalId);
      expect(await ctx.gate.positionProposalCount(key)).to.equal(0n);
    });

    it("post-expiry-finalize replay blocked for all three types", async function () {
      const ctx = await deployProposalAccountingStack();
      const usdc = await ethers.deployContract("MockERC20", ["USDC", "USDC", 6]);
      const cbbtc = await ethers.deployContract("MockERC20", ["cbBTC", "cbBTC", 8]);
      const harvest = await submitHarvestProposal(ctx);
      const compound = await submitCompoundProposal(ctx, { usdc, cbbtc, suffix: "x" });
      const rebalance = await submitRebalanceProposal(ctx, {
        usdc,
        cbbtc,
        suffix: "y",
        body: { executionNonce: 2n, idempotencyKey: ethers.id("reb-y") },
      });
      await time.increase(601);
      await ctx.automation.connect(ctx.keeper).finalizeExpiredHarvestProposal(harvest.proposalId);
      await ctx.automation.connect(ctx.keeper).finalizeExpiredCompoundProposal(compound.proposalId);
      await ctx.automation.connect(ctx.keeper).finalizeExpiredRebalanceProposal(rebalance.proposalId);

      await expect(
        ctx.gate.connect(ctx.tlSigner).markRejected(harvest.proposalId, ethers.id("replay")),
      ).to.be.revertedWithCustomError(ctx.gate, "AlreadyHandled");
      await expect(
        ctx.gate.connect(ctx.tlSigner).markCompoundRejected(compound.proposalId, ethers.id("replay")),
      ).to.be.revertedWithCustomError(ctx.gate, "AlreadyHandled");
      await expect(
        ctx.gate.connect(ctx.tlSigner).markRebalanceRejected(rebalance.proposalId, ethers.id("replay")),
      ).to.be.revertedWithCustomError(ctx.gate, "AlreadyHandled");
    });
  });

  describe("circuit-breaker scope and isolation", function () {
    it("uses global failedExecutionStreak + circuitBroken (gate-wide, not per user/pool)", async function () {
      const ctx = await deployProposalAccountingStack();
      expect(await ctx.gate.failedExecutionStreak()).to.equal(0n);
      expect(await ctx.gate.circuitBroken()).to.equal(false);

      const { proposalId } = await submitHarvestProposal(ctx);
      await ctx.gate.connect(ctx.tlSigner).markRejected(proposalId, ethers.id("fail"));
      expect(await ctx.gate.failedExecutionStreak()).to.equal(1n);
    });

    it("positionProposalCount is isolated per user/pool/positionTokenId", async function () {
      const ctx = await deployProposalAccountingStack();
      const signers = await ethers.getSigners();
      const otherUser = signers[4];

      const harvestA = await submitHarvestProposal(ctx);
      const latest = await time.latest();
      const harvestBInput = {
        chainId: (await ethers.provider.getNetwork()).chainId,
        user: otherUser.address,
        permissionId: ethers.ZeroHash,
        poolId: POOL_ID,
        adapter: ctx.adapterAddr,
        positionTokenId: 7n,
        action: 0,
        executionNonce: 1n,
        deadline: BigInt(latest + 600),
        idempotencyKey: ethers.id("other-user-harvest"),
        reasonCode: ethers.id("fees"),
        observedValue: 1n,
      };
      const harvestBId = await ctx.gate.submitProposal.staticCall(harvestBInput);
      await ctx.gate.submitProposal(harvestBInput);
      const keyB = posKey(otherUser.address, POOL_ID, 7n);

      expect(await ctx.gate.positionProposalCount(harvestA.posKey)).to.equal(1n);
      expect(await ctx.gate.positionProposalCount(keyB)).to.equal(1n);

      await ctx.gate.connect(ctx.tlSigner).markRejected(harvestA.proposalId, ethers.id("only-a"));
      expect(await ctx.gate.positionProposalCount(harvestA.posKey)).to.equal(0n);
      expect(await ctx.gate.positionProposalCount(keyB)).to.equal(1n);

      await ctx.gate.connect(ctx.tlSigner).markRejected(harvestBId, ethers.id("only-b"));
      expect(await ctx.gate.positionProposalCount(keyB)).to.equal(0n);
    });

    it("compound failure streak trips global circuit but does not corrupt unrelated position counters", async function () {
      const ctx = await deployProposalAccountingStack();
      const usdc = await ethers.deployContract("MockERC20", ["USDC", "USDC", 6]);
      const cbbtc = await ethers.deployContract("MockERC20", ["cbBTC", "cbBTC", 8]);
      await ctx.gate.connect(ctx.tlSigner).setLimits(60, 20, 1);

      const harvest = await submitHarvestProposal(ctx, { suffix: "iso-h" });
      const compound = await submitCompoundProposal(ctx, { usdc, cbbtc, suffix: "iso-c" });
      await ctx.gate.connect(ctx.tlSigner).markCompoundRejected(compound.proposalId, ethers.id("trip"));

      expect(await ctx.gate.circuitBroken()).to.equal(true);
      expect(await ctx.gate.positionProposalCount(compound.posKey)).to.equal(0n);
      expect(await ctx.gate.positionProposalCount(harvest.posKey)).to.equal(1n);

      await expect(
        submitCompoundProposal(ctx, { usdc, cbbtc, suffix: "blocked" }),
      ).to.be.revertedWithCustomError(ctx.gate, "CircuitOpen");

      await time.increase(601);
      await ctx.automation.connect(ctx.keeper).finalizeExpiredHarvestProposal(harvest.proposalId);
      expect((await ctx.gate.getProposal(harvest.proposalId)).rejected).to.equal(true);
    });
  });

  describe("expiry cleanup (keeper finalize)", function () {
    it("finalizes expired harvest proposal once without incrementing failure streak", async function () {
      const ctx = await deployProposalAccountingStack();
      const { proposalId, posKey: key } = await submitHarvestProposal(ctx);

      await time.increase(601);
      await ctx.automation.connect(ctx.keeper).finalizeExpiredHarvestProposal(proposalId);

      const stored = await ctx.gate.getProposal(proposalId);
      expect(stored.rejected).to.equal(true);
      expect(stored.consumed).to.equal(false);
      expect(await ctx.gate.positionProposalCount(key)).to.equal(0n);
      expect(await ctx.gate.failedExecutionStreak()).to.equal(0n);

      await expect(
        ctx.automation.connect(ctx.keeper).finalizeExpiredHarvestProposal(proposalId),
      ).to.be.revertedWithCustomError(ctx.automation, "ProposalAlreadyHandled");
    });

    it("execute still reverts ProposalExpired; finalize is separate cleanup path", async function () {
      const ctx = await deployProposalAccountingStack();
      const { proposalId } = await submitHarvestProposal(ctx);
      await time.increase(601);

      await expect(
        ctx.automation.connect(ctx.keeper).executeHarvestProposal(proposalId),
      ).to.be.revertedWithCustomError(ctx.automation, "ProposalExpired");
    });

    it("compound and rebalance expiry cleanup mirror harvest semantics", async function () {
      const ctx = await deployProposalAccountingStack();
      const usdc = await ethers.deployContract("MockERC20", ["USDC", "USDC", 6]);
      const cbbtc = await ethers.deployContract("MockERC20", ["cbBTC", "cbBTC", 8]);

      const cmp = await submitCompoundProposal(ctx, { usdc, cbbtc });
      const reb = await submitRebalanceProposal(ctx, {
        usdc,
        cbbtc,
        suffix: "r",
        body: { executionNonce: 2n, idempotencyKey: ethers.id("reb-r") },
      });

      await time.increase(601);
      await ctx.automation.connect(ctx.keeper).finalizeExpiredCompoundProposal(cmp.proposalId);
      await ctx.automation.connect(ctx.keeper).finalizeExpiredRebalanceProposal(reb.proposalId);

      expect(await ctx.gate.positionProposalCount(cmp.posKey)).to.equal(0n);
      expect(await ctx.gate.positionProposalCount(reb.posKey)).to.equal(0n);
      expect((await ctx.gate.getCompoundProposal(cmp.proposalId)).rejected).to.equal(true);
      expect((await ctx.gate.getRebalanceProposal(reb.proposalId)).rejected).to.equal(true);
    });
  });

  describe("deadline boundary (block.timestamp == deadline)", function () {
    it("finalize reverts ProposalNotExpired while block.timestamp == deadline", async function () {
      const ctx = await deployProposalAccountingStack();
      const deadline = BigInt((await time.latest()) + 600);
      const { proposalId } = await submitHarvestProposal(ctx, {
        body: { deadline, idempotencyKey: ethers.id("deadline-finalize-edge") },
      });
      const storedDeadline = (await ctx.gate.getProposal(proposalId)).deadline;
      const jump = Number(storedDeadline) - (await time.latest()) - 1;
      if (jump > 0) await time.increase(jump);

      await expect(
        ctx.automation.connect(ctx.keeper).finalizeExpiredHarvestProposal(proposalId),
      ).to.be.revertedWithCustomError(ctx.automation, "ProposalNotExpired");
    });

    it("owner reject allowed at block.timestamp == deadline; finalize after > deadline", async function () {
      const ctx = await deployProposalAccountingStack();
      const deadline = BigInt((await time.latest()) + 600);
      const first = await submitHarvestProposal(ctx, {
        body: { deadline, idempotencyKey: ethers.id("deadline-reject-edge-1") },
      });
      const second = await submitHarvestProposal(ctx, {
        suffix: "b",
        body: { deadline, executionNonce: 2n, idempotencyKey: ethers.id("deadline-reject-edge-2") },
      });
      const storedDeadline = (await ctx.gate.getProposal(first.proposalId)).deadline;
      const jump = Number(storedDeadline) - (await time.latest()) - 1;
      if (jump > 0) await time.increase(jump);

      await ctx.gate.connect(ctx.tlSigner).markRejected(first.proposalId, ethers.id("edge-reject"));
      expect(await ctx.gate.failedExecutionStreak()).to.equal(1n);

      await ctx.automation.connect(ctx.keeper).finalizeExpiredHarvestProposal(second.proposalId);
      expect((await ctx.gate.getProposal(second.proposalId)).rejected).to.equal(true);
      expect(await ctx.gate.failedExecutionStreak()).to.equal(1n);
    });
  });

  describe("circuit breaker fail closed on keeper execution", function () {
    it("blocks keeper execute when circuitBroken but allows expiry finalize cleanup", async function () {
      const ctx = await deployProposalAccountingStack();
      const { proposalId } = await submitHarvestProposal(ctx);
      await ctx.gate.connect(ctx.tlSigner).setCircuitBroken(true);

      await expect(
        ctx.automation.connect(ctx.keeper).executeHarvestProposal(proposalId),
      ).to.be.revertedWithCustomError(ctx.automation, "CircuitOpen");

      await time.increase(601);
      await ctx.automation.connect(ctx.keeper).finalizeExpiredHarvestProposal(proposalId);
      expect((await ctx.gate.getProposal(proposalId)).rejected).to.equal(true);
    });
  });
});

describe("SC-07 permission limit boundaries (on-chain enforced paths)", function () {
  it("enforces PermissionRegistry maxAmountPerTx at validateExecution", async function () {
    const [user, feeRecipient] = await ethers.getSigners();
    const permissionRegistry = await ethers.deployContract("PermissionRegistry");
    const feeRouter = await ethers.deployContract("FeeRouter", [feeRecipient.address]);
    const executor = await ethers.deployContract("StableClubExecutor", [
      await permissionRegistry.getAddress(),
      await feeRouter.getAddress(),
    ]);
    await permissionRegistry.setOperator(await executor.getAddress(), true);

    const perm = {
      user: user.address,
      chainId: (await ethers.provider.getNetwork()).chainId,
      poolId: ethers.id("LIMIT_POOL"),
      tokenA: ethers.ZeroAddress,
      tokenB: ethers.ZeroAddress,
      allowedActions: 1n << 0n,
      maxAmountPerTx: 1000n,
      maxAmountPerDay: 5000n,
      maxSlippageBps: 500n,
      minTimeBetweenExecutions: 0n,
      maxExecutionsPerDay: 50n,
      expiresAt: BigInt((await time.latest()) + 86400),
      revoked: false,
      paused: false,
    };
    await permissionRegistry.connect(user).registerPermission(perm);
    const permissionId = await permissionRegistry.permissionIdFor(
      perm.user,
      perm.chainId,
      perm.poolId,
      perm.tokenA,
      perm.tokenB,
    );

    const executorAddr = await executor.getAddress();
    const executorSigner = await impersonateOperator(executorAddr);

    await expect(
      permissionRegistry.connect(executorSigner).validateExecution(permissionId, 0, 1001n, 100n, 1n),
    ).to.be.revertedWithCustomError(permissionRegistry, "AmountExceedsTxLimit");

    await permissionRegistry.connect(executorSigner).validateExecution(
      permissionId,
      0,
      1000n,
      100n,
      1n,
    );
  });
});
