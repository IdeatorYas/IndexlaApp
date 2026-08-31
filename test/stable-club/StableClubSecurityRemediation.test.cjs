const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const {
  deployStableClubStack,
  POOL_ID,
} = require("../../scripts/stable-club/deploy-local.cjs");

const ALL_ACTIONS =
  (1n << 0n) |
  (1n << 1n) |
  (1n << 2n) |
  (1n << 3n) |
  (1n << 4n) |
  (1n << 6n) |
  (1n << 7n);

const AUTOMATION_ACTIONS =
  (1n << 8n) | // Harvest
  (1n << 9n) | // Compound
  (1n << 10n); // Rebalance

const STEP2_POOL = ethers.keccak256(
  ethers.toUtf8Bytes("INDEXLA_STABLE_CLUB_BASE_USDC_cbBTC_AERO_CL100"),
);

async function deployStep2Stack() {
  const [deployer, user, attacker, feeRecipient] = await ethers.getSigners();

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
  await mevGuard.setOracle(await oracleGuard.getAddress());

  const usdcFeed = await ethers.deployContract("MockAggregatorV3", [1_00000000n]);
  const btcFeed = await ethers.deployContract("MockAggregatorV3", [100_00000000n]);
  const usdc = await ethers.deployContract("MockERC20", ["USD Coin", "USDC", 6]);
  const cbbtc = await ethers.deployContract("MockERC20", ["Coinbase BTC", "cbBTC", 8]);

  await oracleGuard.configureFeed(await usdc.getAddress(), await usdcFeed.getAddress(), 3600, 8);
  await oracleGuard.configureFeed(await cbbtc.getAddress(), await btcFeed.getAddress(), 3600, 8);

  const clAdapter = await ethers.deployContract("MockConcentratedLiquidityAdapter", [
    await automation.getAddress(),
    STEP2_POOL,
    "aerodrome-slipstream",
  ]);

  await automation.setAdapterApproval(await clAdapter.getAddress(), true);
  await automation.registerPool(STEP2_POOL, await clAdapter.getAddress(), true);
  await automation.setOfficialPoolCatalogue(STEP2_POOL, true);
  await automation.activateOfficialPool(STEP2_POOL);
  await automation.setTokenApproval(await usdc.getAddress(), true);
  await automation.setTokenApproval(await cbbtc.getAddress(), true);

  await usdc.mint(user.address, ethers.parseUnits("100000", 6));
  await cbbtc.mint(user.address, ethers.parseUnits("10", 8));
  await usdc.mint(await clAdapter.getAddress(), ethers.parseUnits("100000", 6));
  await cbbtc.mint(await clAdapter.getAddress(), ethers.parseUnits("10", 8));

  return {
    deployer,
    user,
    attacker,
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

async function mintPosition(ctx, amountA, amountB) {
  await ethers.provider.send("hardhat_impersonateAccount", [await ctx.automation.getAddress()]);
  await ethers.provider.send("hardhat_setBalance", [
    await ctx.automation.getAddress(),
    ethers.toQuantity(ethers.parseEther("1")),
  ]);
  const automationSigner = await ethers.getSigner(await ctx.automation.getAddress());
  await ctx.usdc.connect(ctx.user).transfer(await ctx.automation.getAddress(), amountA);
  await ctx.cbbtc.connect(ctx.user).transfer(await ctx.automation.getAddress(), amountB);
  await ctx.usdc.connect(automationSigner).approve(await ctx.clAdapter.getAddress(), amountA);
  await ctx.cbbtc.connect(automationSigner).approve(await ctx.clAdapter.getAddress(), amountB);
  await ctx.clAdapter.connect(automationSigner).mintPosition(
    ctx.user.address,
    await ctx.usdc.getAddress(),
    await ctx.cbbtc.getAddress(),
    -100000,
    -90000,
    amountA,
    amountB,
    1,
    1,
  );
  const tokenId = 1n;
  // Least-privilege per-token ERC721 approve (adapter is also the mock NPM).
  await ctx.clAdapter.connect(ctx.user).approve(await ctx.clAdapter.getAddress(), tokenId);
  return tokenId;
}

describe("PR1 security remediation — adversarial regressions", function () {
  describe("C1 — allowlist ACL", function () {
    it("blocks non-owner adapter / pool / token allowlist mutation (Step1)", async function () {
      const ctx = await deployStableClubStack();
      const [, , attacker] = await ethers.getSigners();
      await expect(
        ctx.executorContract.connect(attacker).setAdapterApproval(ethers.ZeroAddress, true),
      ).to.be.revertedWithCustomError(ctx.executorContract, "Unauthorized");
      await expect(
        ctx.executorContract.connect(attacker).setTokenApproval(ctx.usdc, true),
      ).to.be.revertedWithCustomError(ctx.executorContract, "Unauthorized");
    });

    it("blocks non-owner allowlist and official activation (Step2)", async function () {
      const ctx = await deployStep2Stack();
      await expect(
        ctx.automation.connect(ctx.attacker).setAdapterApproval(ethers.ZeroAddress, true),
      ).to.be.revertedWithCustomError(ctx.automation, "Unauthorized");
      await expect(
        ctx.automation.connect(ctx.attacker).activateOfficialPool(STEP2_POOL),
      ).to.be.revertedWithCustomError(ctx.automation, "Unauthorized");
      await expect(
        ctx.automation.connect(ctx.attacker).setOfficialPoolCatalogue(STEP2_POOL, true),
      ).to.be.revertedWithCustomError(ctx.automation, "Unauthorized");
    });
  });

  describe("C2 — operator-only validators", function () {
    it("blocks arbitrary callers from burning nonces / daily caps", async function () {
      const ctx = await deployStableClubStack();
      const perm = {
        user: ctx.testUser.address,
        chainId: (await ethers.provider.getNetwork()).chainId,
        poolId: POOL_ID,
        tokenA: ctx.usdc,
        tokenB: ctx.weth,
        allowedActions: ALL_ACTIONS,
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

      const [, , attacker] = await ethers.getSigners();
      await expect(
        ctx.permissionRegistryContract
          .connect(attacker)
          .validateExecution(permissionId, 0, 1n, 0, 1n),
      ).to.be.revertedWithCustomError(ctx.permissionRegistryContract, "UnauthorizedUser");

      await expect(
        ctx.permissionRegistryContract
          .connect(ctx.testUser)
          .validateEmergencyExecution(permissionId, 2n),
      ).to.be.revertedWithCustomError(ctx.permissionRegistryContract, "UnauthorizedUser");
    });
  });

  describe("H2 — MevGuard minOut bypass", function () {
    it("rejects minOut far below oracle expectedOut / quote band", async function () {
      const ctx = await deployStep2Stack();
      const now = await time.latest();
      // Align 6↔8 decimals so expectedOut == amountIn at $1 USDC / $100 synthetic.
      await ctx.btcFeed.setAnswer(100_00000000n);
      const usdc = await ctx.usdc.getAddress();
      const cbbtc = await ctx.cbbtc.getAddress();
      const amountIn = 1_000_000n;
      const expected = await ctx.oracleGuard.expectedAmountOut(usdc, cbbtc, amountIn, 6, 8);

      await expect(
        ctx.mevGuard.assertSwapProtections(usdc, cbbtc, amountIn, 1n, expected, 100, now + 60),
      ).to.be.revertedWithCustomError(ctx.mevGuard, "ExcessiveSlippage");

      const okMin = (expected * 9850n) / 10000n;
      await ctx.mevGuard.assertSwapProtections(
        usdc, cbbtc, amountIn, okMin, expected, 150, now + 60,
      );
    });
  });

  describe("H3 — official catalogue gate", function () {
    it("cannot activate a pool that is not in the on-chain catalogue", async function () {
      const ctx = await deployStep2Stack();
      const otherPool = ethers.keccak256(ethers.toUtf8Bytes("NOT_CATALOGUED"));
      const otherAdapter = await ethers.deployContract("MockConcentratedLiquidityAdapter", [
        await ctx.automation.getAddress(),
        otherPool,
        "uniswap-v3",
      ]);
      await ctx.automation.setAdapterApproval(await otherAdapter.getAddress(), true);
      await ctx.automation.registerPool(otherPool, await otherAdapter.getAddress(), true);
      await expect(ctx.automation.activateOfficialPool(otherPool)).to.be.revertedWithCustomError(
        ctx.automation,
        "OfficialPoolNotInCatalogue",
      );
    });
  });

  describe("H5 — deposit swap minOut required", function () {
    it("rejects deposit swap with zero minAmountOut", async function () {
      const ctx = await deployStableClubStack();
      const perm = {
        user: ctx.testUser.address,
        chainId: (await ethers.provider.getNetwork()).chainId,
        poolId: POOL_ID,
        tokenA: ctx.usdc,
        tokenB: ctx.weth,
        allowedActions: ALL_ACTIONS,
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

      const deposit = ethers.parseUnits("1000", 6);
      const swapPart = ethers.parseUnits("400", 6);
      await ctx.usdcContract.connect(ctx.testUser).approve(ctx.executor, deposit);
      await ctx.usdcContract.connect(ctx.testUser).approve(ctx.feeRouter, swapPart);

      await expect(
        ctx.executorContract.connect(ctx.testUser).depositAndAddLiquidity(
          permissionId,
          1n,
          ctx.testAdapter,
          ctx.usdc,
          ctx.usdc,
          ctx.weth,
          deposit,
          swapPart,
          0n, // minAmountOut
          1n,
          100n,
        ),
      ).to.be.revertedWithCustomError(ctx.executorContract, "MinOutRequired");
    });
  });

  describe("H1/H6 — compound / rebalance mins + swap accounting", function () {
    it("rejects compound with zero amount mins and keeps zero executor balance on success", async function () {
      const ctx = await deployStep2Stack();
      const perm = {
        user: ctx.user.address,
        chainId: (await ethers.provider.getNetwork()).chainId,
        poolId: STEP2_POOL,
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

      const tokenId = await mintPosition(
        ctx,
        ethers.parseUnits("200", 6),
        ethers.parseUnits("0.2", 8),
      );

      // Mock default collect fee: 1 USDC + 0.01 cbBTC (1e6 raw each).
      const amountA = 1_000_000n;
      const amountB = 1_000_000n;

      await expect(
        ctx.automation.connect(ctx.user).compound(
          permissionId,
          1n,
          await ctx.clAdapter.getAddress(),
          tokenId,
          await ctx.usdc.getAddress(),
          await ctx.usdc.getAddress(),
          await ctx.cbbtc.getAddress(),
          0n,
          0n,
          amountA,
          amountB,
          0n, // amountAMin
          0n, // amountBMin
          100n,
          BigInt((await time.latest()) + 600),
          0n,
        ),
      ).to.be.revertedWithCustomError(ctx.automation, "SlippageMinRequired");

      const preUsdc = await ctx.usdc.balanceOf(await ctx.automation.getAddress());
      const preBtc = await ctx.cbbtc.balanceOf(await ctx.automation.getAddress());

      await ctx.automation.connect(ctx.user).compound(
        permissionId,
        2n,
        await ctx.clAdapter.getAddress(),
        tokenId,
        await ctx.usdc.getAddress(),
        await ctx.usdc.getAddress(),
        await ctx.cbbtc.getAddress(),
        0n,
        0n,
        amountA,
        amountB,
        1n,
        1n,
        100n,
        BigInt((await time.latest()) + 600),
        0n,
      );

      expect(await ctx.usdc.balanceOf(await ctx.automation.getAddress())).to.equal(preUsdc);
      expect(await ctx.cbbtc.balanceOf(await ctx.automation.getAddress())).to.equal(preBtc);
    });

    it("compound with swap routes output into LP and retains no balances", async function () {
      const ctx = await deployStep2Stack();
      const perm = {
        user: ctx.user.address,
        chainId: (await ethers.provider.getNetwork()).chainId,
        poolId: STEP2_POOL,
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

      const tokenId = await mintPosition(
        ctx,
        ethers.parseUnits("200", 6),
        ethers.parseUnits("0.2", 8),
      );

      const swapAmount = ethers.parseUnits("100", 6);
      const usdcAddr = await ctx.usdc.getAddress();
      const [t0] = await ctx.clAdapter.positionTokens(tokenId);
      if (t0 === usdcAddr) {
        await ctx.clAdapter.setCollectFeeAmounts(swapAmount, 0n);
      } else {
        await ctx.clAdapter.setCollectFeeAmounts(0n, swapAmount);
      }
      await ctx.btcFeed.setAnswer(100_00000000n);
      const net = (swapAmount * 99n) / 100n;
      const expected = await ctx.oracleGuard.expectedAmountOut(
        await ctx.usdc.getAddress(),
        await ctx.cbbtc.getAddress(),
        net,
        6,
        8,
      );
      const minOut = (expected * 9850n) / 10000n;

      const preUsdc = await ctx.usdc.balanceOf(await ctx.automation.getAddress());
      const preBtc = await ctx.cbbtc.balanceOf(await ctx.automation.getAddress());
      const feeBefore = await ctx.usdc.balanceOf(ctx.feeRecipient.address);

      await ctx.automation.connect(ctx.user).compound(
        permissionId,
        1n,
        await ctx.clAdapter.getAddress(),
        tokenId,
        await ctx.usdc.getAddress(), // rewardToken
        await ctx.usdc.getAddress(),
        await ctx.cbbtc.getAddress(),
        swapAmount,
        minOut,
        0n,
        0n,
        0n,
        minOut,
        150n,
        BigInt((await time.latest()) + 600),
        expected,
      );

      expect(await ctx.usdc.balanceOf(await ctx.automation.getAddress())).to.equal(preUsdc);
      expect(await ctx.cbbtc.balanceOf(await ctx.automation.getAddress())).to.equal(preBtc);
      expect(await ctx.usdc.balanceOf(ctx.feeRecipient.address)).to.equal(
        feeBefore + (swapAmount * 1n) / 100n,
      );
    });
  });

  describe("M1 — token binding", function () {
    it("rejects harvest/compound tokens not bound to permission", async function () {
      const ctx = await deployStep2Stack();
      const rogue = await ethers.deployContract("MockERC20", ["Rogue", "RG", 18]);
      await ctx.automation.setTokenApproval(await rogue.getAddress(), true);

      const perm = {
        user: ctx.user.address,
        chainId: (await ethers.provider.getNetwork()).chainId,
        poolId: STEP2_POOL,
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

      const tokenId = await mintPosition(
        ctx,
        ethers.parseUnits("50", 6),
        ethers.parseUnits("0.05", 8),
      );

      await expect(
        ctx.automation.connect(ctx.user).compound(
          permissionId,
          1n,
          await ctx.clAdapter.getAddress(),
          tokenId,
          await rogue.getAddress(),
          await rogue.getAddress(),
          await ctx.cbbtc.getAddress(),
          0n,
          0n,
          ethers.parseUnits("1", 6),
          0n,
          1n,
          0n,
          100n,
          BigInt((await time.latest()) + 600),
          0n,
        ),
      ).to.be.revertedWithCustomError(ctx.automation, "TokenNotBound");
    });
  });

  describe("M2 — harvest oracle / depeg", function () {
    it("blocks harvest when token is depegged", async function () {
      const ctx = await deployStep2Stack();
      const perm = {
        user: ctx.user.address,
        chainId: (await ethers.provider.getNetwork()).chainId,
        poolId: STEP2_POOL,
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
      const tokenId = await mintPosition(
        ctx,
        ethers.parseUnits("50", 6),
        ethers.parseUnits("0.05", 8),
      );

      await ctx.safetyController.setStablecoinDepegged(await ctx.usdc.getAddress(), true);
      await expect(
        ctx.automation.connect(ctx.user).harvest(permissionId, 1n, await ctx.clAdapter.getAddress(), tokenId),
      ).to.be.revertedWithCustomError(ctx.safetyController, "DepegActive");
    });
  });

  describe("M4 — OpenServ positionProposalCount", function () {
    it("decrements position proposal count on consume and reject", async function () {
      const ctx = await deployStep2Stack();
      await ctx.openServGate.setLimits(10, 20, 10);
      const proposal = {
        user: ctx.user.address,
        permissionId: ethers.ZeroHash,
        poolId: STEP2_POOL,
        positionTokenId: 7n,
        action: 0,
        reasonCode: ethers.id("fees"),
        observedValue: 1n,
        timestamp: 0n,
        idempotencyKey: ethers.id("m4-a"),
        consumed: false,
        rejected: false,
      };
      const id = await ctx.openServGate.submitProposal.staticCall(proposal);
      await ctx.openServGate.submitProposal(proposal);
      const posKey = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "bytes32", "uint256"],
          [ctx.user.address, STEP2_POOL, 7n],
        ),
      );
      expect(await ctx.openServGate.positionProposalCount(posKey)).to.equal(1n);
      await ctx.openServGate.markConsumed(id);
      expect(await ctx.openServGate.positionProposalCount(posKey)).to.equal(0n);

      proposal.idempotencyKey = ethers.id("m4-b");
      const id2 = await ctx.openServGate.submitProposal.staticCall(proposal);
      await ctx.openServGate.submitProposal(proposal);
      expect(await ctx.openServGate.positionProposalCount(posKey)).to.equal(1n);
      await ctx.openServGate.markRejected(id2, ethers.id("nope"));
      expect(await ctx.openServGate.positionProposalCount(posKey)).to.equal(0n);
    });
  });

  describe("M5 — nonce after ownership/pool checks", function () {
    it("does not consume nonce when position ownership check fails", async function () {
      const ctx = await deployStep2Stack();
      const perm = {
        user: ctx.user.address,
        chainId: (await ethers.provider.getNetwork()).chainId,
        poolId: STEP2_POOL,
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

      // No position minted — ownerOf(99) reverts before nonce consume
      await expect(
        ctx.automation.connect(ctx.user).harvest(permissionId, 42n, await ctx.clAdapter.getAddress(), 99n),
      ).to.be.reverted;

      expect(await ctx.permissionRegistry.executionNonceUsed(permissionId, 42n)).to.equal(false);
    });
  });

  describe("M6 — permission unpause", function () {
    it("allows user to unpause a paused permission", async function () {
      const ctx = await deployStableClubStack();
      const perm = {
        user: ctx.testUser.address,
        chainId: (await ethers.provider.getNetwork()).chainId,
        poolId: POOL_ID,
        tokenA: ctx.usdc,
        tokenB: ctx.weth,
        allowedActions: ALL_ACTIONS,
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
      await ctx.permissionRegistryContract.connect(ctx.testUser).pause(permissionId);
      expect((await ctx.permissionRegistryContract.getPermission(permissionId)).paused).to.equal(true);
      await ctx.permissionRegistryContract.connect(ctx.testUser).unpause(permissionId);
      expect((await ctx.permissionRegistryContract.getPermission(permissionId)).paused).to.equal(false);
    });
  });

  describe("M3 — oracle deviation separate from permission slippage", function () {
    it("uses oracle default deviation when maxDeviationBps is 0", async function () {
      const ctx = await deployStep2Stack();
      expect(await ctx.oracleGuard.defaultMaxDeviationBps()).to.equal(100n);
      expect(
        await ctx.oracleGuard.validatePrices(
          await ctx.usdc.getAddress(),
          await ctx.cbbtc.getAddress(),
          0,
        ),
      ).to.equal(true);

      await ctx.oracleGuard.setTwapRequired(true);
      await expect(
        ctx.oracleGuard.validatePrices(await ctx.usdc.getAddress(), await ctx.cbbtc.getAddress(), 0),
      ).to.be.revertedWithCustomError(ctx.oracleGuard, "TwapRequiredMissing");
    });
  });
});
