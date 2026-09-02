const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const {
  deployStableClubStack,
  POOL_ID,
} = require("../../scripts/stable-club/deploy-local.cjs");
const { activateStep2PoolWithGovernance, impersonateTimelock } = require("../../scripts/stable-club/governance-activation-local.cjs");

const AUTOMATION_ACTIONS =
  (1n << 8n) | // Harvest
  (1n << 9n) | // Compound
  (1n << 10n); // Rebalance

const STEP1_ACTIONS =
  (1n << 0n) |
  (1n << 1n) |
  (1n << 2n) |
  (1n << 3n) |
  (1n << 4n) |
  (1n << 6n) |
  (1n << 7n);

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
    timelockAddr,
  };
}

async function mintAndApprovePosition(ctx, amountA, amountB, tokenIdHint = 1n) {
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
  await ctx.clAdapter.connect(ctx.user).approve(await ctx.clAdapter.getAddress(), tokenIdHint);
  return tokenIdHint;
}

async function registerAutomationPerm(ctx, overrides = {}) {
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
    ...overrides,
  };
  await ctx.permissionRegistry.connect(ctx.user).registerPermission(perm);
  const permissionId = await ctx.permissionRegistry.permissionIdFor(
    perm.user,
    perm.chainId,
    perm.poolId,
    perm.tokenA,
    perm.tokenB,
  );
  return { perm, permissionId };
}

describe("Bugbot remediation — finding 1 FeeRouter wiring", function () {
  it("rejects unauthorized, zero-address, and duplicate wireExecutor", async function () {
    const [owner, attacker, feeRecipient, executorA, executorB] = await ethers.getSigners();
    const feeRouter = await ethers.deployContract("FeeRouter", [feeRecipient.address]);

    await expect(
      feeRouter.connect(attacker).wireExecutor(executorA.address),
    ).to.be.revertedWithCustomError(feeRouter, "Unauthorized");

    await expect(feeRouter.connect(owner).wireExecutor(ethers.ZeroAddress)).to.be.revertedWithCustomError(
      feeRouter,
      "InvalidExecutor",
    );

    await feeRouter.connect(owner).wireExecutor(executorA.address);
    expect(await feeRouter.executor()).to.equal(executorA.address);

    await expect(feeRouter.connect(owner).wireExecutor(executorB.address)).to.be.revertedWithCustomError(
      feeRouter,
      "ExecutorAlreadyWired",
    );
  });
});

describe("Bugbot remediation — finding 2 token sorting", function () {
  it("maps amountA/amountB correctly for both address orderings (mock Uni/Aero mapper)", async function () {
    const [deployer, user] = await ethers.getSigners();
    const poolId = ethers.id("SORT_POOL");
    const adapter = await ethers.deployContract("MockConcentratedLiquidityAdapter", [
      deployer.address,
      poolId,
      "uniswap-v3",
    ]);

    // Force known address order: tokenHi > tokenLo
    const tokenLo = await ethers.deployContract("MockERC20", ["Lo", "LO", 6]);
    const tokenHi = await ethers.deployContract("MockERC20", ["Hi", "HI", 8]);
    // Ensure tokenLo.address < tokenHi.address by redeploying if needed
    let lo = tokenLo;
    let hi = tokenHi;
    if ((await lo.getAddress()) > (await hi.getAddress())) {
      lo = tokenHi;
      hi = tokenLo;
    }

    const amountLo = ethers.parseUnits("100", 6);
    const amountHi = ethers.parseUnits("2", 8);
    await lo.mint(deployer.address, amountLo * 3n);
    await hi.mint(deployer.address, amountHi * 3n);
    await lo.mint(await adapter.getAddress(), amountLo * 3n);
    await hi.mint(await adapter.getAddress(), amountHi * 3n);

    // Natural order: tokenA=lo, tokenB=hi
    await lo.approve(await adapter.getAddress(), amountLo);
    await hi.approve(await adapter.getAddress(), amountHi);
    await adapter.mintPosition(
      user.address,
      await lo.getAddress(),
      await hi.getAddress(),
      -10,
      10,
      amountLo,
      amountHi,
      1,
      1,
    );
    const tokenId1 = 1n;
    expect(await adapter.token0Of(tokenId1)).to.equal(await lo.getAddress());
    expect(await adapter.token1Of(tokenId1)).to.equal(await hi.getAddress());
    expect(await adapter.amount0Of(tokenId1)).to.equal(amountLo);
    expect(await adapter.amount1Of(tokenId1)).to.equal(amountHi);

    await adapter.connect(user).approve(await adapter.getAddress(), tokenId1);
    const addA = ethers.parseUnits("10", 6);
    const addB = ethers.parseUnits("1", 8);
    await lo.approve(await adapter.getAddress(), addA);
    await hi.approve(await adapter.getAddress(), addB);
    // Reversed caller order: tokenA=hi, tokenB=lo → amounts must swap into token0/token1
    await adapter.increaseLiquidity(
      user.address,
      tokenId1,
      await hi.getAddress(),
      await lo.getAddress(),
      addB, // amountA for hi
      addA, // amountB for lo
      1,
      1,
    );
    expect(await adapter.amount0Of(tokenId1)).to.equal(amountLo + addA);
    expect(await adapter.amount1Of(tokenId1)).to.equal(amountHi + addB);

    // Reverse mint path: tokenA=hi, tokenB=lo
    await lo.approve(await adapter.getAddress(), amountLo);
    await hi.approve(await adapter.getAddress(), amountHi);
    await adapter.mintPosition(
      user.address,
      await hi.getAddress(),
      await lo.getAddress(),
      -10,
      10,
      amountHi,
      amountLo,
      1,
      1,
    );
    const tokenId2 = 2n;
    expect(await adapter.token0Of(tokenId2)).to.equal(await lo.getAddress());
    expect(await adapter.token1Of(tokenId2)).to.equal(await hi.getAddress());
    expect(await adapter.amount0Of(tokenId2)).to.equal(amountLo);
    expect(await adapter.amount1Of(tokenId2)).to.equal(amountHi);
  });
});

describe("Bugbot remediation — finding 3 user-owned NFT authorization", function () {
  it("fails clearly without per-token approval and succeeds after ERC721 approve", async function () {
    const ctx = await deployStep2Stack();
    const { permissionId } = await registerAutomationPerm(ctx);

    await ethers.provider.send("hardhat_impersonateAccount", [await ctx.automation.getAddress()]);
    await ethers.provider.send("hardhat_setBalance", [
      await ctx.automation.getAddress(),
      ethers.toQuantity(ethers.parseEther("1")),
    ]);
    const automationSigner = await ethers.getSigner(await ctx.automation.getAddress());
    const amountA = ethers.parseUnits("50", 6);
    const amountB = ethers.parseUnits("0.05", 8);
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

    await expect(
      ctx.automation.connect(ctx.user).harvest(permissionId, 1n, await ctx.clAdapter.getAddress(), tokenId),
    ).to.be.revertedWithCustomError(ctx.automation, "PositionApprovalRequired");

    // Real NPM-compatible per-token approve (mock adapter is ERC721 position manager).
    await ctx.clAdapter.connect(ctx.user).approve(await ctx.clAdapter.getAddress(), tokenId);
    expect(await ctx.clAdapter.getApproved(tokenId)).to.equal(await ctx.clAdapter.getAddress());

    await ctx.automation.connect(ctx.user).harvest(permissionId, 2n, await ctx.clAdapter.getAddress(), tokenId);
  });

  it("enforces NPM-compatible getApproved gate without setApprovalForAll (separate NPM)", async function () {
    const [lpOwner] = await ethers.getSigners();
    const npm = await ethers.deployContract("MockNpmStylePositionManager");
    const gate = await ethers.deployContract("NpmApprovalGateHarness", [await npm.getAddress()]);
    await npm.setMinter(lpOwner.address);
    const tokenId = await npm.mint.staticCall(lpOwner.address);
    await npm.mint(lpOwner.address);

    await expect(gate.requireNpmApproval(tokenId, lpOwner.address)).to.be.revertedWithCustomError(
      gate,
      "AdapterNotApprovedForPosition",
    );

    await npm.connect(lpOwner).approve(await gate.getAddress(), tokenId);
    expect(await npm.getApproved(tokenId)).to.equal(await gate.getAddress());
    await gate.requireNpmApproval(tokenId, lpOwner.address);
  });
});

describe("Bugbot remediation — finding 4 Step1 pool binding", function () {
  async function registerStep1Perm(ctx, poolId) {
    const perm = {
      user: ctx.testUser.address,
      chainId: (await ethers.provider.getNetwork()).chainId,
      poolId,
      tokenA: ctx.usdc,
      tokenB: ctx.weth,
      allowedActions: STEP1_ACTIONS,
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
    return ctx.permissionRegistryContract.permissionIdFor(
      perm.user,
      perm.chainId,
      perm.poolId,
      perm.tokenA,
      perm.tokenB,
    );
  }

  it("rejects swap/removeLiquidity/withdrawAll/emergencyExit when perm.poolId mismatches adapter", async function () {
    const ctx = await deployStableClubStack();
    const tlSigner = await impersonateTimelock(ctx.timelockAddr);
    const otherPool = ethers.id("OTHER_STEP1_POOL");
    const otherAdapter = await ethers.deployContract("ConfigurableTestPoolAdapter", [
      ctx.executor,
      otherPool,
    ]);
    await ctx.executorContract.connect(tlSigner).setAdapterApproval(await otherAdapter.getAddress(), true);
    await ctx.executorContract.connect(tlSigner).registerPool(otherPool, await otherAdapter.getAddress(), true);
    await ctx.usdcContract.mint(await otherAdapter.getAddress(), ethers.parseUnits("100000", 6));
    await ctx.wethContract.mint(await otherAdapter.getAddress(), ethers.parseEther("100"));

    const permissionId = await registerStep1Perm(ctx, POOL_ID);

    await expect(
      ctx.executorContract.connect(ctx.testUser).swap(
        permissionId,
        1n,
        await otherAdapter.getAddress(),
        ctx.usdc,
        ctx.weth,
        ethers.parseUnits("10", 6),
        1n,
        100n,
      ),
    ).to.be.revertedWithCustomError(ctx.executorContract, "PoolMismatch");

    await expect(
      ctx.executorContract.connect(ctx.testUser).removeLiquidity(
        permissionId,
        2n,
        await otherAdapter.getAddress(),
        ctx.usdc,
        ctx.weth,
        1n,
        0n,
        0n,
        100n,
      ),
    ).to.be.revertedWithCustomError(ctx.executorContract, "PoolMismatch");

    await expect(
      ctx.executorContract.connect(ctx.testUser).withdrawAll(
        permissionId,
        3n,
        await otherAdapter.getAddress(),
        ctx.usdc,
        ctx.weth,
        1n,
        0n,
        0n,
        100n,
      ),
    ).to.be.revertedWithCustomError(ctx.executorContract, "PoolMismatch");

    await expect(
      ctx.executorContract.connect(ctx.testUser).emergencyExit(
        permissionId,
        4n,
        await otherAdapter.getAddress(),
        ctx.usdc,
        ctx.weth,
        1n,
        1n,
        1n,
      ),
    ).to.be.revertedWithCustomError(ctx.executorContract, "PoolMismatch");
  });
});

describe("Bugbot remediation — finding 5 rebalance caps on full position value", function () {
  it("blocks rebalance when oracle position value exceeds tx cap even if swapAmount is small", async function () {
    const ctx = await deployStep2Stack();
    // Cap below full position value; old bug only checked swapAmount.
    const { permissionId } = await registerAutomationPerm(ctx, {
      maxAmountPerTx: ethers.parseUnits("500", 6),
      maxAmountPerDay: ethers.parseUnits("500", 6),
    });

    // Position ~2000 USDC + 0.02 cbBTC@$100k ≈ 4000 USDC-normalized
    const tokenId = await mintAndApprovePosition(
      ctx,
      ethers.parseUnits("2000", 6),
      ethers.parseUnits("0.02", 8),
    );

    const tinySwap = ethers.parseUnits("10", 6); // would bypass old swapAmount-only cap
    await expect(
      ctx.automation.connect(ctx.user).rebalance(
        permissionId,
        1n,
        await ctx.clAdapter.getAddress(),
        tokenId,
        await ctx.usdc.getAddress(),
        await ctx.cbbtc.getAddress(),
        -90000,
        -80000,
        tinySwap,
        1n,
        1n,
        1n,
        1n,
        1n,
        100n,
        BigInt((await time.latest()) + 600),
        1n,
      ),
    ).to.be.revertedWithCustomError(ctx.permissionRegistry, "AmountExceedsTxLimit");
  });

  it("fails closed when live position amounts are undetermined (zero)", async function () {
    const ctx = await deployStep2Stack();
    const { permissionId } = await registerAutomationPerm(ctx);
    const tokenId = await mintAndApprovePosition(
      ctx,
      ethers.parseUnits("100", 6),
      ethers.parseUnits("0.01", 8),
    );
    await ctx.clAdapter.setAmountsForTest(tokenId, 0n, 0n);
    await expect(
      ctx.automation.connect(ctx.user).rebalance(
        permissionId,
        1n,
        await ctx.clAdapter.getAddress(),
        tokenId,
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
        100n,
        BigInt((await time.latest()) + 600),
        0n,
      ),
    ).to.be.revertedWithCustomError(ctx.automation, "PositionValueUnavailable");
  });

  it("fails closed on stale oracle prices during rebalance valuation", async function () {
    const ctx = await deployStep2Stack();
    const { permissionId } = await registerAutomationPerm(ctx);
    const tokenId = await mintAndApprovePosition(
      ctx,
      ethers.parseUnits("100", 6),
      ethers.parseUnits("0.01", 8),
    );
    const now = await time.latest();
    await ctx.btcFeed.setUpdatedAt(now - 10_000);
    await expect(
      ctx.automation.connect(ctx.user).rebalance(
        permissionId,
        1n,
        await ctx.clAdapter.getAddress(),
        tokenId,
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
        100n,
        BigInt((await time.latest()) + 600),
        0n,
      ),
    ).to.be.revertedWithCustomError(ctx.oracleGuard, "StaleFeed");
  });

  it("live positionAmounts drive caps — empty amounts fail closed (no tracked-amount bypass)", async function () {
    const ctx = await deployStep2Stack();
    const { permissionId } = await registerAutomationPerm(ctx, {
      maxAmountPerTx: ethers.parseUnits("50000", 6),
    });
    const tokenId = await mintAndApprovePosition(
      ctx,
      ethers.parseUnits("100", 6),
      ethers.parseUnits("0.01", 8),
    );
    // Simulate missing live valuation (would have been empty _tracked on external NFT).
    await ctx.clAdapter.setAmountsForTest(tokenId, 0n, 0n);
    await expect(
      ctx.automation.connect(ctx.user).rebalance(
        permissionId,
        1n,
        await ctx.clAdapter.getAddress(),
        tokenId,
        await ctx.usdc.getAddress(),
        await ctx.cbbtc.getAddress(),
        -90000,
        -80000,
        1n, // tiny swap cannot bypass empty live value
        1n,
        1n,
        1n,
        1n,
        1n,
        100n,
        BigInt((await time.latest()) + 600),
        1n,
      ),
    ).to.be.revertedWithCustomError(ctx.automation, "PositionValueUnavailable");
  });

  it("caller-swapped tokenA/tokenB cannot bypass USDC-denominated caps", async function () {
    const ctx = await deployStep2Stack();
    // Permission tokenA = USDC. Cap far below live position value in USDC terms.
    const { permissionId } = await registerAutomationPerm(ctx, {
      maxAmountPerTx: ethers.parseUnits("500", 6),
      maxAmountPerDay: ethers.parseUnits("500", 6),
    });
    const tokenId = await mintAndApprovePosition(
      ctx,
      ethers.parseUnits("2000", 6),
      ethers.parseUnits("0.02", 8),
    );
    // Call with reversed order — old bug recast value into cbBTC units under the USDC cap.
    await expect(
      ctx.automation.connect(ctx.user).rebalance(
        permissionId,
        1n,
        await ctx.clAdapter.getAddress(),
        tokenId,
        await ctx.cbbtc.getAddress(),
        await ctx.usdc.getAddress(),
        -90000,
        -80000,
        0n,
        0n,
        1n,
        1n,
        1n,
        1n,
        100n,
        BigInt((await time.latest()) + 600),
        0n,
      ),
    ).to.be.revertedWithCustomError(ctx.permissionRegistry, "AmountExceedsTxLimit");
  });
});

describe("Bugbot remediation — finding 6 rebalance token allowlist", function () {
  it("rejects rebalance when a position token is not allowlisted", async function () {
    const ctx = await deployStep2Stack();
    const { permissionId } = await registerAutomationPerm(ctx);
    const tokenId = await mintAndApprovePosition(
      ctx,
      ethers.parseUnits("100", 6),
      ethers.parseUnits("0.01", 8),
    );

    await ctx.automation.connect(await impersonateTimelock(ctx.timelockAddr)).setTokenApproval(await ctx.cbbtc.getAddress(), false);

    await expect(
      ctx.automation.connect(ctx.user).rebalance(
        permissionId,
        1n,
        await ctx.clAdapter.getAddress(),
        tokenId,
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
        100n,
        BigInt((await time.latest()) + 600),
        0n,
      ),
    ).to.be.revertedWithCustomError(ctx.automation, "TokenNotApproved");
  });
});

describe("Bugbot remediation — finding 7 ownership zero-address safety", function () {
  it("rejects ownership transfer to address(0) and allows valid transfer", async function () {
    const [, nextOwner] = await ethers.getSigners();
    const mevGuard = await ethers.deployContract("MevGuard");
    const oracleGuard = await ethers.deployContract("OracleGuard");
    const safetyController = await ethers.deployContract("SafetyController");
    const openServGate = await ethers.deployContract("OpenServProposalGate");

    for (const c of [mevGuard, oracleGuard, safetyController, openServGate]) {
      await expect(c.transferOwnership(ethers.ZeroAddress)).to.be.revertedWithCustomError(c, "Unauthorized");
      await c.transferOwnership(nextOwner.address);
      expect(await c.owner()).to.equal(nextOwner.address);
    }
  });
});
