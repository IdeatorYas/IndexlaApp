const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { activateStep2PoolWithGovernance, impersonateTimelock } = require("../../scripts/stable-club/governance-activation-local.cjs");

const COMPOUND_ACTIONS = (1n << 8n) | (1n << 9n);
const HARVEST_ONLY_ACTIONS = 1n << 8n;
const STEP2_POOL = ethers.keccak256(
  ethers.toUtf8Bytes("INDEXLA_STABLE_CLUB_BASE_USDC_cbBTC_AERO_CL100"),
);

async function deployCompoundStack() {
  const [deployer, user, feeRecipient] = await ethers.getSigners();
  const permissionRegistry = await ethers.deployContract("PermissionRegistry");
  const feeRouter = await ethers.deployContract("FeeRouter", [feeRecipient.address]);
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
    STEP2_POOL,
    "aerodrome-slipstream",
  ]);
  await automation.setAdapterApproval(await clAdapter.getAddress(), true);
  await automation.registerPool(STEP2_POOL, await clAdapter.getAddress(), true);
  await automation.setOfficialPoolCatalogue(STEP2_POOL, true);
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
    openServGate,
    poolId: STEP2_POOL,
    signers: signers.slice(0, 3),
  });

  await usdc.mint(user.address, ethers.parseUnits("100000", 6));
  await cbbtc.mint(user.address, ethers.parseUnits("10", 8));
  await usdc.mint(await clAdapter.getAddress(), ethers.parseUnits("100000", 6));
  await cbbtc.mint(await clAdapter.getAddress(), ethers.parseUnits("10", 8));

  return {
    user,
    feeRecipient,
    permissionRegistry,
    feeRouter,
    oracleGuard,
    automation,
    clAdapter,
    usdc,
    cbbtc,
    usdcFeed,
    btcFeed,
    timelockAddr,
  };
}

async function registerCompoundPermission(ctx, overrides = {}) {
  const perm = {
    user: ctx.user.address,
    chainId: (await ethers.provider.getNetwork()).chainId,
    poolId: STEP2_POOL,
    tokenA: await ctx.usdc.getAddress(),
    tokenB: await ctx.cbbtc.getAddress(),
    allowedActions: COMPOUND_ACTIONS,
    maxAmountPerTx: ethers.parseUnits("50000", 6),
    maxAmountPerDay: ethers.parseUnits("200000", 6),
    maxSlippageBps: 500n,
    minTimeBetweenExecutions: 0n,
    maxExecutionsPerDay: 50n,
    expiresAt: BigInt((await time.latest()) + 86400 * 7),
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

async function setUsdcCollectFee(ctx, tokenId, amount) {
  const usdcAddr = await ctx.usdc.getAddress();
  const [t0] = await ctx.clAdapter.positionTokens(tokenId);
  if (t0 === usdcAddr) {
    await ctx.clAdapter.setCollectFeeAmounts(amount, 0n);
  } else {
    await ctx.clAdapter.setCollectFeeAmounts(0n, amount);
  }
}

async function setCbbtcCollectFee(ctx, tokenId, amount) {
  const cbbtcAddr = await ctx.cbbtc.getAddress();
  const [t0] = await ctx.clAdapter.positionTokens(tokenId);
  if (t0 === cbbtcAddr) {
    await ctx.clAdapter.setCollectFeeAmounts(amount, 0n);
  } else {
    await ctx.clAdapter.setCollectFeeAmounts(0n, amount);
  }
}

async function mintPosition(ctx, amountA, amountB) {
  const automationAddr = await ctx.automation.getAddress();
  await ethers.provider.send("hardhat_impersonateAccount", [automationAddr]);
  await ethers.provider.send("hardhat_setBalance", [
    automationAddr,
    ethers.toQuantity(ethers.parseEther("1")),
  ]);
  const automationSigner = await ethers.getSigner(automationAddr);
  await ctx.usdc.connect(ctx.user).transfer(automationAddr, amountA);
  await ctx.cbbtc.connect(ctx.user).transfer(automationAddr, amountB);
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
  await ctx.clAdapter.connect(ctx.user).approve(await ctx.clAdapter.getAddress(), tokenId);
  return tokenId;
}

async function compoundViaExecutor(ctx, permissionId, tokenId, overrides = {}) {
  const { signer = ctx.user, ...paramsOverrides } = overrides;
  const params = {
    executionNonce: 1n,
    rewardToken: await ctx.usdc.getAddress(),
    tokenA: await ctx.usdc.getAddress(),
    tokenB: await ctx.cbbtc.getAddress(),
    swapAmount: 0n,
    minAmountOut: 0n,
    amountA: 1_000_000n,
    amountB: 0n,
    amountAMin: 1n,
    amountBMin: 0n,
    slippageBps: 100n,
    deadline: BigInt((await time.latest()) + 600),
    quotedAmountOut: 0n,
    ...paramsOverrides,
  };
  return ctx.automation.connect(signer).compound(
    permissionId,
    params.executionNonce,
    await ctx.clAdapter.getAddress(),
    tokenId,
    params.rewardToken,
    params.tokenA,
    params.tokenB,
    params.swapAmount,
    params.minAmountOut,
    params.amountA,
    params.amountB,
    params.amountAMin,
    params.amountBMin,
    params.slippageBps,
    params.deadline,
    params.quotedAmountOut,
  );
}

describe("Stable Club — atomic compound accounting (Phase 1)", function () {
  it("never pulls from user wallet — succeeds with zero ERC20 approvals", async function () {
    const ctx = await deployCompoundStack();
    const permissionId = await registerCompoundPermission(ctx);
    const tokenId = await mintPosition(ctx, ethers.parseUnits("200", 6), ethers.parseUnits("0.2", 8));
    await ctx.clAdapter.setCollectFeeAmounts(1_000_000n, 1_000_000n);

    expect(await ctx.usdc.allowance(ctx.user.address, await ctx.automation.getAddress())).to.equal(0n);
    expect(await ctx.usdc.allowance(ctx.user.address, await ctx.feeRouter.getAddress())).to.equal(0n);

    const preUsdc = await ctx.usdc.balanceOf(await ctx.automation.getAddress());
    await ctx.automation.connect(ctx.user).compound(
      permissionId,
      1n,
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
      100n,
      BigInt((await time.latest()) + 600),
      0n,
    );

    expect(await ctx.usdc.allowance(ctx.user.address, await ctx.automation.getAddress())).to.equal(0n);
    expect(await ctx.usdc.balanceOf(await ctx.automation.getAddress())).to.equal(preUsdc);
  });

  it("reverts when spend exceeds collected balance delta", async function () {
    const ctx = await deployCompoundStack();
    const permissionId = await registerCompoundPermission(ctx);
    const tokenId = await mintPosition(ctx, ethers.parseUnits("50", 6), ethers.parseUnits("0.05", 8));
    await ctx.clAdapter.setCollectFeeAmounts(1_000_000n, 1_000_000n);

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
        2_000_000n,
        0n,
        1n,
        0n,
        100n,
        BigInt((await time.latest()) + 600),
        0n,
      ),
    ).to.be.revertedWithCustomError(ctx.automation, "ExceedsCollectedFees");

    expect(await ctx.permissionRegistry.executionNonceUsed(permissionId, 1n)).to.equal(false);
  });

  it("enforces oracle-normalized tx limit — mixed decimals cannot bypass via raw sum", async function () {
    const ctx = await deployCompoundStack();
    const permissionId = await registerCompoundPermission(ctx, {
      maxAmountPerTx: ethers.parseUnits("5", 6),
      maxAmountPerDay: ethers.parseUnits("200000", 6),
    });
    const tokenId = await mintPosition(ctx, ethers.parseUnits("50", 6), ethers.parseUnits("0.05", 8));
    // collectFee0/1 are token0/token1 amounts (address-sorted), not tokenA/tokenB.
    const usdcAddr = await ctx.usdc.getAddress();
    const [t0] = await ctx.clAdapter.positionTokens(tokenId);
    if (t0.toLowerCase() === usdcAddr.toLowerCase()) {
      await ctx.clAdapter.setCollectFeeAmounts(5_000_000n, 1_000_000n);
    } else {
      await ctx.clAdapter.setCollectFeeAmounts(1_000_000n, 5_000_000n);
    }

    // Raw sum 5e6 + 1e6 = 6e6 would pass old check; oracle cbBTC leg adds ~1000 USDC notional.
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
        5_000_000n,
        1_000_000n,
        1n,
        1n,
        100n,
        BigInt((await time.latest()) + 600),
        0n,
      ),
    ).to.be.revertedWithCustomError(ctx.permissionRegistry, "AmountExceedsTxLimit");
  });

  it("accumulates oracle-normalized notional against daily cap", async function () {
    const ctx = await deployCompoundStack();
    const permissionId = await registerCompoundPermission(ctx, {
      maxAmountPerTx: ethers.parseUnits("50000", 6),
      maxAmountPerDay: ethers.parseUnits("6", 6),
    });
    const tokenId = await mintPosition(ctx, ethers.parseUnits("50", 6), ethers.parseUnits("0.05", 8));
    await setUsdcCollectFee(ctx, tokenId, 5_000_000n);

    await ctx.automation.connect(ctx.user).compound(
      permissionId,
      1n,
      await ctx.clAdapter.getAddress(),
      tokenId,
      await ctx.usdc.getAddress(),
      await ctx.usdc.getAddress(),
      await ctx.cbbtc.getAddress(),
      0n,
      0n,
      5_000_000n,
      0n,
      1n,
      0n,
      100n,
      BigInt((await time.latest()) + 600),
      0n,
    );

    await expect(
      ctx.automation.connect(ctx.user).compound(
        permissionId,
        2n,
        await ctx.clAdapter.getAddress(),
        tokenId,
        await ctx.usdc.getAddress(),
        await ctx.usdc.getAddress(),
        await ctx.cbbtc.getAddress(),
        0n,
        0n,
        2_000_000n,
        0n,
        1n,
        0n,
        100n,
        BigInt((await time.latest()) + 600),
        0n,
      ),
    ).to.be.revertedWithCustomError(ctx.permissionRegistry, "AmountExceedsDailyLimit");
  });

  it("handles rewardToken==tokenA overlap without double-counting spend cap", async function () {
    const ctx = await deployCompoundStack();
    const permissionId = await registerCompoundPermission(ctx);
    const tokenId = await mintPosition(ctx, ethers.parseUnits("200", 6), ethers.parseUnits("0.2", 8));
    const totalUsdc = ethers.parseUnits("50", 6);
    await setUsdcCollectFee(ctx, tokenId, totalUsdc);
    await ctx.btcFeed.setAnswer(100_00000000n);

    const swapAmount = ethers.parseUnits("30", 6);
    const lpAmount = ethers.parseUnits("25", 6);
    const net = (swapAmount * 99n) / 100n;
    const expected = await ctx.oracleGuard.expectedAmountOut(
      await ctx.usdc.getAddress(),
      await ctx.cbbtc.getAddress(),
      net,
      6,
      8,
    );
    const minOut = (expected * 9850n) / 10000n;

    await expect(
      ctx.automation.connect(ctx.user).compound(
        permissionId,
        1n,
        await ctx.clAdapter.getAddress(),
        tokenId,
        await ctx.usdc.getAddress(),
        await ctx.usdc.getAddress(),
        await ctx.cbbtc.getAddress(),
        swapAmount,
        minOut,
        lpAmount,
        0n,
        1n,
        minOut,
        150n,
        BigInt((await time.latest()) + 600),
        expected,
      ),
    ).to.be.revertedWithCustomError(ctx.automation, "ExceedsCollectedFees");

    const preUsdc = await ctx.usdc.balanceOf(await ctx.automation.getAddress());
    await ctx.automation.connect(ctx.user).compound(
      permissionId,
      2n,
      await ctx.clAdapter.getAddress(),
      tokenId,
      await ctx.usdc.getAddress(),
      await ctx.usdc.getAddress(),
      await ctx.cbbtc.getAddress(),
      swapAmount,
      minOut,
      ethers.parseUnits("15", 6),
      0n,
      1n,
      minOut,
      150n,
      BigInt((await time.latest()) + 600),
      expected,
    );
    expect(await ctx.usdc.balanceOf(await ctx.automation.getAddress())).to.equal(preUsdc);
  });

  it("refunds adapter dust and restores pre-call executor balances", async function () {
    const ctx = await deployCompoundStack();
    const permissionId = await registerCompoundPermission(ctx);
    const tokenId = await mintPosition(ctx, ethers.parseUnits("100", 6), ethers.parseUnits("0.1", 8));
    await ctx.clAdapter.setCollectFeeAmounts(3_000_000n, 2_000_000n);
    await ctx.clAdapter.setDustLeaveBps(500n);

    const seedUsdc = ethers.parseUnits("7", 6);
    await ctx.usdc.mint(await ctx.automation.getAddress(), seedUsdc);
    const preUsdc = await ctx.usdc.balanceOf(await ctx.automation.getAddress());
    const preBtc = await ctx.cbbtc.balanceOf(await ctx.automation.getAddress());
    const userUsdcBefore = await ctx.usdc.balanceOf(ctx.user.address);

    await ctx.automation.connect(ctx.user).compound(
      permissionId,
      1n,
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
      100n,
      BigInt((await time.latest()) + 600),
      0n,
    );

    expect(await ctx.usdc.balanceOf(await ctx.automation.getAddress())).to.equal(preUsdc);
    expect(await ctx.cbbtc.balanceOf(await ctx.automation.getAddress())).to.equal(preBtc);
    expect(await ctx.usdc.balanceOf(ctx.user.address)).to.be.gt(userUsdcBefore);
  });

  it("rolls back nonce consumption when compound reverts after collect", async function () {
    const ctx = await deployCompoundStack();
    const permissionId = await registerCompoundPermission(ctx);
    const tokenId = await mintPosition(ctx, ethers.parseUnits("50", 6), ethers.parseUnits("0.05", 8));
    await setUsdcCollectFee(ctx, tokenId, 1_000_000n);

    await expect(
      ctx.automation.connect(ctx.user).compound(
        permissionId,
        7n,
        await ctx.clAdapter.getAddress(),
        tokenId,
        await ctx.usdc.getAddress(),
        await ctx.usdc.getAddress(),
        await ctx.cbbtc.getAddress(),
        0n,
        0n,
        2_000_000n,
        0n,
        1n,
        0n,
        100n,
        BigInt((await time.latest()) + 600),
        0n,
      ),
    ).to.be.revertedWithCustomError(ctx.automation, "ExceedsCollectedFees");

    expect(await ctx.permissionRegistry.executionNonceUsed(permissionId, 7n)).to.equal(false);
    expect(await ctx.permissionRegistry.dailySpent(permissionId)).to.equal(0n);
  });

  describe("rewardToken accounting", function () {
    async function deployWithAeroReward() {
      const ctx = await deployCompoundStack();
      const tlSigner = await impersonateTimelock(ctx.timelockAddr);
      const aeroFeed = await ethers.deployContract("MockAggregatorV3", [1_00000000n]);
      const aero = await ethers.deployContract("MockERC20", ["Aero", "AERO", 6]);
      await ctx.oracleGuard.connect(tlSigner).configureFeed(await aero.getAddress(), await aeroFeed.getAddress(), 3600, 8);
      await ctx.automation.connect(tlSigner).setTokenApproval(await aero.getAddress(), true);
      await aero.mint(await ctx.clAdapter.getAddress(), ethers.parseUnits("1000", 6));
      return { ...ctx, aero, aeroFeed };
    }

    it("distinct reward token: caps swap to collected rewards, refunds unused, restores executor balance", async function () {
      const ctx = await deployWithAeroReward();
      const permissionId = await registerCompoundPermission(ctx);
      const tokenId = await mintPosition(ctx, ethers.parseUnits("100", 6), ethers.parseUnits("0.1", 8));
      const rewardAmount = ethers.parseUnits("10", 6);
      const swapAmount = ethers.parseUnits("6", 6);
      await ctx.clAdapter.setCollectFeeAmounts(0n, 0n);
      await ctx.clAdapter.setCollectReward(await ctx.aero.getAddress(), rewardAmount);
      await ctx.btcFeed.setAnswer(100_00000000n);

      const seedAero = ethers.parseUnits("3", 6);
      await ctx.aero.mint(await ctx.automation.getAddress(), seedAero);
      const preAero = await ctx.aero.balanceOf(await ctx.automation.getAddress());
      const preUsdc = await ctx.usdc.balanceOf(await ctx.automation.getAddress());
      const preBtc = await ctx.cbbtc.balanceOf(await ctx.automation.getAddress());
      const userAeroBefore = await ctx.aero.balanceOf(ctx.user.address);

      const net = (swapAmount * 99n) / 100n;
      const expected = await ctx.oracleGuard.expectedAmountOut(
        await ctx.aero.getAddress(),
        await ctx.cbbtc.getAddress(),
        net,
        6,
        8,
      );
      const minOut = (expected * 9850n) / 10000n;

      await ctx.automation.connect(ctx.user).compound(
        permissionId,
        1n,
        await ctx.clAdapter.getAddress(),
        tokenId,
        await ctx.aero.getAddress(),
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

      expect(await ctx.aero.balanceOf(await ctx.automation.getAddress())).to.equal(preAero);
      expect(await ctx.usdc.balanceOf(await ctx.automation.getAddress())).to.equal(preUsdc);
      expect(await ctx.cbbtc.balanceOf(await ctx.automation.getAddress())).to.equal(preBtc);
      expect(await ctx.aero.balanceOf(ctx.user.address)).to.equal(
        userAeroBefore + (rewardAmount - swapAmount),
      );
    });

    it("rewardToken == tokenB: rejects same-token swap", async function () {
      const ctx = await deployCompoundStack();
      const permissionId = await registerCompoundPermission(ctx);
      const tokenId = await mintPosition(ctx, ethers.parseUnits("50", 6), ethers.parseUnits("0.05", 8));

      await expect(
        ctx.automation.connect(ctx.user).compound(
          permissionId,
          1n,
          await ctx.clAdapter.getAddress(),
          tokenId,
          await ctx.cbbtc.getAddress(),
          await ctx.usdc.getAddress(),
          await ctx.cbbtc.getAddress(),
          1_000_000n,
          1n,
          0n,
          0n,
          0n,
          1n,
          100n,
          BigInt((await time.latest()) + 600),
          1n,
        ),
      ).to.be.revertedWithCustomError(ctx.automation, "SameTokenSwap");
    });

    it("rewardToken == tokenB: LP-only compound without swap succeeds", async function () {
      const ctx = await deployCompoundStack();
      const permissionId = await registerCompoundPermission(ctx);
      const tokenId = await mintPosition(ctx, ethers.parseUnits("50", 6), ethers.parseUnits("0.05", 8));
      await setCbbtcCollectFee(ctx, tokenId, 1_000_000n);

      const preUsdc = await ctx.usdc.balanceOf(await ctx.automation.getAddress());
      const preBtc = await ctx.cbbtc.balanceOf(await ctx.automation.getAddress());

      await ctx.automation.connect(ctx.user).compound(
        permissionId,
        1n,
        await ctx.clAdapter.getAddress(),
        tokenId,
        await ctx.cbbtc.getAddress(),
        await ctx.usdc.getAddress(),
        await ctx.cbbtc.getAddress(),
        0n,
        0n,
        0n,
        1_000_000n,
        0n,
        1n,
        100n,
        BigInt((await time.latest()) + 600),
        0n,
      );

      expect(await ctx.usdc.balanceOf(await ctx.automation.getAddress())).to.equal(preUsdc);
      expect(await ctx.cbbtc.balanceOf(await ctx.automation.getAddress())).to.equal(preBtc);
    });

    it("distinct reward token: rejects swap exceeding collected reward delta", async function () {
      const ctx = await deployWithAeroReward();
      const permissionId = await registerCompoundPermission(ctx);
      const tokenId = await mintPosition(ctx, ethers.parseUnits("50", 6), ethers.parseUnits("0.05", 8));
      await ctx.clAdapter.setCollectFeeAmounts(0n, 0n);
      await ctx.clAdapter.setCollectReward(await ctx.aero.getAddress(), 1_000_000n);

      await expect(
        ctx.automation.connect(ctx.user).compound(
          permissionId,
          1n,
          await ctx.clAdapter.getAddress(),
          tokenId,
          await ctx.aero.getAddress(),
          await ctx.usdc.getAddress(),
          await ctx.cbbtc.getAddress(),
          2_000_000n,
          1n,
          0n,
          0n,
          0n,
          1n,
          100n,
          BigInt((await time.latest()) + 600),
          1n,
        ),
      ).to.be.revertedWithCustomError(ctx.automation, "ExceedsCollectedFees");
    });

    it("restores all affected executor balances including seeded reward token", async function () {
      const ctx = await deployWithAeroReward();
      const permissionId = await registerCompoundPermission(ctx);
      const tokenId = await mintPosition(ctx, ethers.parseUnits("100", 6), ethers.parseUnits("0.1", 8));
      await ctx.clAdapter.setCollectFeeAmounts(1_000_000n, 1_000_000n);
      await ctx.clAdapter.setCollectReward(await ctx.aero.getAddress(), ethers.parseUnits("5", 6));

      await ctx.usdc.mint(await ctx.automation.getAddress(), ethers.parseUnits("2", 6));
      await ctx.cbbtc.mint(await ctx.automation.getAddress(), 500_000n);
      await ctx.aero.mint(await ctx.automation.getAddress(), ethers.parseUnits("1", 6));

      const preUsdc = await ctx.usdc.balanceOf(await ctx.automation.getAddress());
      const preBtc = await ctx.cbbtc.balanceOf(await ctx.automation.getAddress());
      const preAero = await ctx.aero.balanceOf(await ctx.automation.getAddress());

      await ctx.automation.connect(ctx.user).compound(
        permissionId,
        1n,
        await ctx.clAdapter.getAddress(),
        tokenId,
        await ctx.aero.getAddress(),
        await ctx.usdc.getAddress(),
        await ctx.cbbtc.getAddress(),
        0n,
        0n,
        1_000_000n,
        1_000_000n,
        1n,
        1n,
        100n,
        BigInt((await time.latest()) + 600),
        0n,
      );

      expect(await ctx.usdc.balanceOf(await ctx.automation.getAddress())).to.equal(preUsdc);
      expect(await ctx.cbbtc.balanceOf(await ctx.automation.getAddress())).to.equal(preBtc);
      expect(await ctx.aero.balanceOf(await ctx.automation.getAddress())).to.equal(preAero);
    });
  });

  describe("permission limits via compound()", function () {
    it("enforces Compound action bit on executor path", async function () {
      const ctx = await deployCompoundStack();
      const permissionId = await registerCompoundPermission(ctx, { allowedActions: HARVEST_ONLY_ACTIONS });
      const tokenId = await mintPosition(ctx, ethers.parseUnits("50", 6), ethers.parseUnits("0.05", 8));
      await setUsdcCollectFee(ctx, tokenId, 1_000_000n);

      await expect(compoundViaExecutor(ctx, permissionId, tokenId)).to.be.revertedWithCustomError(
        ctx.permissionRegistry,
        "ActionNotAllowed",
      );
      expect(await ctx.permissionRegistry.executionNonceUsed(permissionId, 1n)).to.equal(false);
    });

    it("enforces maxSlippageBps on executor path", async function () {
      const ctx = await deployCompoundStack();
      const permissionId = await registerCompoundPermission(ctx, { maxSlippageBps: 100n });
      const tokenId = await mintPosition(ctx, ethers.parseUnits("50", 6), ethers.parseUnits("0.05", 8));
      await setUsdcCollectFee(ctx, tokenId, 1_000_000n);

      await expect(
        compoundViaExecutor(ctx, permissionId, tokenId, { slippageBps: 600n }),
      ).to.be.revertedWithCustomError(ctx.permissionRegistry, "SlippageTooHigh");
      expect(await ctx.permissionRegistry.executionNonceUsed(permissionId, 1n)).to.equal(false);
    });

    it("enforces minTimeBetweenExecutions on executor path", async function () {
      const ctx = await deployCompoundStack();
      const permissionId = await registerCompoundPermission(ctx, { minTimeBetweenExecutions: 3600n });
      const tokenId = await mintPosition(ctx, ethers.parseUnits("50", 6), ethers.parseUnits("0.05", 8));
      await setUsdcCollectFee(ctx, tokenId, 1_000_000n);
      await compoundViaExecutor(ctx, permissionId, tokenId, { executionNonce: 1n });
      await setUsdcCollectFee(ctx, tokenId, 1_000_000n);

      await expect(
        compoundViaExecutor(ctx, permissionId, tokenId, { executionNonce: 2n }),
      ).to.be.revertedWithCustomError(ctx.permissionRegistry, "ExecutionTooSoon");
    });

    it("enforces maxExecutionsPerDay on executor path", async function () {
      const ctx = await deployCompoundStack();
      const permissionId = await registerCompoundPermission(ctx, { maxExecutionsPerDay: 1n });
      const tokenId = await mintPosition(ctx, ethers.parseUnits("50", 6), ethers.parseUnits("0.05", 8));
      await setUsdcCollectFee(ctx, tokenId, 1_000_000n);
      await compoundViaExecutor(ctx, permissionId, tokenId, { executionNonce: 1n });
      await setUsdcCollectFee(ctx, tokenId, 1_000_000n);

      await expect(
        compoundViaExecutor(ctx, permissionId, tokenId, { executionNonce: 2n }),
      ).to.be.revertedWithCustomError(ctx.permissionRegistry, "DailyExecutionLimitReached");
    });

    it("enforces PermissionRegistry expiresAt on executor path", async function () {
      const ctx = await deployCompoundStack();
      const permissionId = await registerCompoundPermission(ctx, {
        expiresAt: BigInt((await time.latest()) + 5),
      });
      const tokenId = await mintPosition(ctx, ethers.parseUnits("50", 6), ethers.parseUnits("0.05", 8));
      await setUsdcCollectFee(ctx, tokenId, 1_000_000n);
      await time.increase(6);

      await expect(compoundViaExecutor(ctx, permissionId, tokenId)).to.be.revertedWithCustomError(
        ctx.permissionRegistry,
        "PermissionExpired",
      );
    });

    it("enforces permission user identity binding on executor path", async function () {
      const ctx = await deployCompoundStack();
      const permissionId = await registerCompoundPermission(ctx);
      const tokenId = await mintPosition(ctx, ethers.parseUnits("50", 6), ethers.parseUnits("0.05", 8));
      await setUsdcCollectFee(ctx, tokenId, 1_000_000n);
      const signers = await ethers.getSigners();
      const stranger = signers[4];

      await expect(
        compoundViaExecutor(ctx, permissionId, tokenId, { signer: stranger }),
      ).to.be.revertedWithCustomError(ctx.permissionRegistry, "UnauthorizedUser");
    });

    it("rejects pool adapter mismatch on executor path", async function () {
      const ctx = await deployCompoundStack();
      const permissionId = await registerCompoundPermission(ctx);
      const tokenId = await mintPosition(ctx, ethers.parseUnits("50", 6), ethers.parseUnits("0.05", 8));
      await setUsdcCollectFee(ctx, tokenId, 1_000_000n);
      const otherAdapter = await ethers.deployContract("MockConcentratedLiquidityAdapter", [
        await ctx.automation.getAddress(),
        ethers.id("OTHER_POOL"),
        "uniswap-v3",
      ]);
      const tlSigner = await impersonateTimelock(ctx.timelockAddr);
      await ctx.automation.connect(tlSigner).setAdapterApproval(await otherAdapter.getAddress(), true);
      await ctx.automation.connect(tlSigner).registerPool(
        ethers.id("OTHER_POOL"),
        await otherAdapter.getAddress(),
        true,
      );
      await ctx.automation.connect(tlSigner).setOfficialPoolCatalogue(ethers.id("OTHER_POOL"), true);

      await expect(
        ctx.automation.connect(ctx.user).compound(
          permissionId,
          1n,
          await otherAdapter.getAddress(),
          tokenId,
          await ctx.usdc.getAddress(),
          await ctx.usdc.getAddress(),
          await ctx.cbbtc.getAddress(),
          0n,
          0n,
          1_000_000n,
          0n,
          1n,
          0n,
          100n,
          BigInt((await time.latest()) + 600),
          0n,
        ),
      ).to.be.revertedWithCustomError(ctx.automation, "PoolMismatch");
    });

    it("rejects unbound token pair on executor path", async function () {
      const ctx = await deployCompoundStack();
      const permissionId = await registerCompoundPermission(ctx);
      const tokenId = await mintPosition(ctx, ethers.parseUnits("50", 6), ethers.parseUnits("0.05", 8));
      await setUsdcCollectFee(ctx, tokenId, 1_000_000n);
      const weth = await ethers.deployContract("MockERC20", ["Wrapped Ether", "WETH", 18]);

      await expect(
        compoundViaExecutor(ctx, permissionId, tokenId, {
          tokenA: await ctx.usdc.getAddress(),
          tokenB: await weth.getAddress(),
        }),
      ).to.be.revertedWithCustomError(ctx.automation, "TokenNotBound");
    });
  });
});
