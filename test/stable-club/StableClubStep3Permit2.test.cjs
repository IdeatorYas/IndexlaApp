const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Step 3 — Permit2 FeeRouter migration (adversarial)", function () {
  async function fixture() {
    const [owner, executor, user, feeRecipient, stranger] = await ethers.getSigners();
    const token = await ethers.deployContract("MockERC20", ["USDC", "USDC", 6]);
    const permit2 = await ethers.deployContract("MockPermit2");
    const feeRouter = await ethers.deployContract("FeeRouter", [feeRecipient.address]);
    await feeRouter.wireExecutor(executor.address);
    await feeRouter.setPermit2(await permit2.getAddress());

    const gross = 10_000n;
    await token.mint(user.address, gross * 10n);
    // User approves Permit2 (bounded), then Permit2 allowance for FeeRouter.
    await token.connect(user).approve(await permit2.getAddress(), gross);
    const expiration = (await time.latest()) + 3600;
    await permit2
      .connect(user)
      .approve(await token.getAddress(), await feeRouter.getAddress(), gross, expiration);

    return { owner, executor, user, feeRecipient, stranger, token, permit2, feeRouter, gross, expiration };
  }

  it("pulls via Permit2 and charges floor fee", async function () {
    const { executor, user, feeRecipient, token, feeRouter, gross } = await fixture();
    const fee = (gross * 100n) / 10_000n;
    await expect(
      feeRouter.connect(executor).applySwapFee(await token.getAddress(), user.address, gross, ethers.id("p")),
    ).to.emit(feeRouter, "SwapFeeCharged");
    expect(await token.balanceOf(feeRecipient.address)).to.equal(fee);
    expect(await token.balanceOf(executor.address)).to.equal(gross - fee);
  });

  it("rejects unlimited Permit2 allowance at MockPermit2", async function () {
    const { user, token, permit2, feeRouter } = await fixture();
    const max = (1n << 160n) - 1n;
    await expect(
      permit2
        .connect(user)
        .approve(await token.getAddress(), await feeRouter.getAddress(), max, (await time.latest()) + 100),
    ).to.be.revertedWithCustomError(permit2, "UnlimitedAllowanceForbidden");
  });

  it("reverts on expired Permit2 allowance", async function () {
    const { executor, user, token, permit2, feeRouter, gross } = await fixture();
    const shortExp = (await time.latest()) + 10;
    await permit2
      .connect(user)
      .approve(await token.getAddress(), await feeRouter.getAddress(), gross, shortExp);
    await time.increase(20);
    await expect(
      feeRouter.connect(executor).applySwapFee(await token.getAddress(), user.address, gross, ethers.id("e")),
    ).to.be.revertedWithCustomError(permit2, "AllowanceExpired");
  });

  it("reverts when stranger spends without allowance", async function () {
    const { stranger, user, token, feeRouter, gross } = await fixture();
    await expect(
      feeRouter.connect(stranger).applySwapFee(await token.getAddress(), user.address, gross, ethers.id("x")),
    ).to.be.revertedWithCustomError(feeRouter, "OnlyExecutor");
  });

  it("reverts on insufficient Permit2 allowance", async function () {
    const { executor, user, token, permit2, feeRouter, gross } = await fixture();
    await permit2
      .connect(user)
      .approve(
        await token.getAddress(),
        await feeRouter.getAddress(),
        gross - 1n,
        (await time.latest()) + 3600,
      );
    await expect(
      feeRouter.connect(executor).applySwapFee(await token.getAddress(), user.address, gross, ethers.id("i")),
    ).to.be.revertedWithCustomError(permit2, "InsufficientAllowance");
  });

  it("reverts when permit2 unset (fail-closed on local chainId 31337)", async function () {
    const [owner, executor, user, feeRecipient] = await ethers.getSigners();
    const token = await ethers.deployContract("MockERC20", ["USDC", "USDC", 6]);
    const feeRouter = await ethers.deployContract("FeeRouter", [feeRecipient.address]);
    await feeRouter.wireExecutor(executor.address);
    expect(await feeRouter.permit2()).to.equal(ethers.ZeroAddress);
    const gross = 1_000n;
    await token.mint(user.address, gross);
    await token.connect(user).approve(await feeRouter.getAddress(), gross);
    await expect(
      feeRouter.connect(executor).applySwapFee(await token.getAddress(), user.address, gross, ethers.id("l")),
    ).to.be.revertedWithCustomError(feeRouter, "Permit2Required");
  });
});

describe("Step 3 — dual-spender Permit2 deposit (FeeRouter + Executor)", function () {
  async function dualFixture() {
    const {
      deployStableClubStack,
      POOL_ID,
    } = require("../../scripts/stable-club/deploy-local.cjs");
    const { impersonateTimelock } = require("../../scripts/stable-club/governance-activation-local.cjs");
    const stack = await deployStableClubStack();
    const user = stack.testUser;
    const permit2 = await ethers.deployContract("MockPermit2");
    const p2 = await permit2.getAddress();
    const [deployer] = await ethers.getSigners();
    const tlSigner = await impersonateTimelock(stack.timelockAddr);

    // Step-1 FeeRouter remains deployer-owned; Step-1 Executor ownership transfers to Timelock.
    await stack.feeRouterContract.connect(deployer).setPermit2(p2);
    await stack.executorContract.connect(tlSigner).setPermit2(p2);

    const deposit = ethers.parseUnits("1000", 6);
    const swap = ethers.parseUnits("400", 6);
    const remaining = deposit - swap;
    await stack.usdcContract.mint(user.address, deposit * 2n);
    await stack.wethContract.mint(stack.testAdapter, ethers.parseEther("100"));

    const ALL =
      (1n << 0n) |
      (1n << 1n) |
      (1n << 2n) |
      (1n << 3n) |
      (1n << 4n) |
      (1n << 6n) |
      (1n << 7n);
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const perm = {
      user: user.address,
      chainId,
      poolId: POOL_ID,
      tokenA: stack.usdc,
      tokenB: stack.weth,
      allowedActions: ALL,
      maxAmountPerTx: ethers.parseUnits("50000", 6),
      maxAmountPerDay: ethers.parseUnits("200000", 6),
      maxSlippageBps: 500n,
      minTimeBetweenExecutions: 0n,
      maxExecutionsPerDay: 50n,
      expiresAt: BigInt((await time.latest()) + 86400 * 7),
      revoked: false,
      paused: false,
    };
    await stack.permissionRegistryContract.connect(user).registerPermission(perm);
    const permissionId = await stack.permissionRegistryContract.permissionIdFor(
      perm.user,
      perm.chainId,
      perm.poolId,
      perm.tokenA,
      perm.tokenB,
    );

    return {
      user,
      stack,
      permit2,
      deposit,
      swap,
      remaining,
      permissionId,
    };
  }

  async function approveSplit(ctx, opts = {}) {
    const { user, stack, permit2, deposit, swap, remaining } = ctx;
    const expiration = opts.expiration ?? (await time.latest()) + 3600;
    const feeAmt = opts.feeAmt ?? swap;
    const execAmt = opts.execAmt ?? remaining;
    const execSpender = opts.execSpender ?? stack.executor;
    await stack.usdcContract.connect(user).approve(await permit2.getAddress(), deposit);
    if (feeAmt > 0n) {
      await permit2.connect(user).approve(stack.usdc, stack.feeRouter, feeAmt, expiration);
    }
    if (execAmt > 0n || opts.forceExecApprove) {
      await permit2.connect(user).approve(stack.usdc, execSpender, execAmt, expiration);
    }
    return expiration;
  }

  it("succeeds when FeeRouter and Executor have split bounded allowances", async function () {
    const ctx = await dualFixture();
    const { user, stack, deposit, swap, permissionId } = ctx;
    await approveSplit(ctx);

    await stack.executorContract.connect(user).depositAndAddLiquidity(
      permissionId,
      1n,
      stack.testAdapter,
      stack.usdc,
      stack.usdc,
      stack.weth,
      deposit,
      swap,
      (swap * 99n) / 100n,
      1n,
      500n,
    );
    expect(await stack.testAdapterContract.balanceOf(user.address)).to.be.gt(0n);
  });

  it("reverts when only FeeRouter is approved (missing executor allowance)", async function () {
    const ctx = await dualFixture();
    const { user, stack, permit2, deposit, swap, permissionId } = ctx;
    const expiration = (await time.latest()) + 3600;
    await stack.usdcContract.connect(user).approve(await permit2.getAddress(), deposit);
    await permit2.connect(user).approve(stack.usdc, stack.feeRouter, swap, expiration);
    await expect(
      stack.executorContract.connect(user).depositAndAddLiquidity(
        permissionId,
        1n,
        stack.testAdapter,
        stack.usdc,
        stack.usdc,
        stack.weth,
        deposit,
        swap,
        (swap * 99n) / 100n,
        1n,
        500n,
      ),
    ).to.be.reverted;
  });

  it("reverts on expired executor allowance", async function () {
    const ctx = await dualFixture();
    const { user, stack, deposit, swap, permissionId } = ctx;
    await approveSplit(ctx, { expiration: (await time.latest()) + 10 });
    await time.increase(20);
    await expect(
      stack.executorContract.connect(user).depositAndAddLiquidity(
        permissionId,
        1n,
        stack.testAdapter,
        stack.usdc,
        stack.usdc,
        stack.weth,
        deposit,
        swap,
        (swap * 99n) / 100n,
        1n,
        500n,
      ),
    ).to.be.reverted;
  });

  it("reverts on insufficient executor allowance", async function () {
    const ctx = await dualFixture();
    const { user, stack, permit2, deposit, swap, remaining, permissionId } = ctx;
    await approveSplit(ctx, { execAmt: remaining - 1n });
    await expect(
      stack.executorContract.connect(user).depositAndAddLiquidity(
        permissionId,
        1n,
        stack.testAdapter,
        stack.usdc,
        stack.usdc,
        stack.weth,
        deposit,
        swap,
        (swap * 99n) / 100n,
        1n,
        500n,
      ),
    ).to.be.revertedWithCustomError(permit2, "InsufficientAllowance");
  });

  it("reverts when Permit2 allowance is for wrong executor", async function () {
    const ctx = await dualFixture();
    const { user, stack, deposit, swap, remaining, permissionId } = ctx;
    const stranger = (await ethers.getSigners())[5];
    await approveSplit(ctx, { execSpender: stranger.address, execAmt: remaining });
    await expect(
      stack.executorContract.connect(user).depositAndAddLiquidity(
        permissionId,
        1n,
        stack.testAdapter,
        stack.usdc,
        stack.usdc,
        stack.weth,
        deposit,
        swap,
        (swap * 99n) / 100n,
        1n,
        500n,
      ),
    ).to.be.reverted;
  });

  it("reverts after revoke (zero) executor allowance", async function () {
    const ctx = await dualFixture();
    const { user, stack, permit2, deposit, swap, permissionId } = ctx;
    const expiration = await approveSplit(ctx);
    await permit2.connect(user).approve(stack.usdc, stack.executor, 0, expiration);
    await expect(
      stack.executorContract.connect(user).depositAndAddLiquidity(
        permissionId,
        1n,
        stack.testAdapter,
        stack.usdc,
        stack.usdc,
        stack.weth,
        deposit,
        swap,
        (swap * 99n) / 100n,
        1n,
        500n,
      ),
    ).to.be.reverted;
  });
});

describe("Step 3 — Base fork address verification (Permit2 / Safe / oracles)", function () {
  this.timeout(180_000);

  it("verifies canonical bytecode and feed descriptions", async function () {
    if (!process.env.BASE_RPC_URL?.trim()) this.skip();
    await network.provider.request({
      method: "hardhat_reset",
      params: [{ forking: { jsonRpcUrl: process.env.BASE_RPC_URL } }],
    });
    // Hardhat/EDR on Base: mine once so eth_call is not on the raw historical fork tip.
    await network.provider.send("evm_mine", []);

    const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
    const SAFE_L2 = "0xfb1bffC9d739B8D520DaF37dF666da4C687191EA";
    const PROXY_FACTORY = "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2";
    const USDC_USD = "0x7e860098F58bBFC8648a4311b374B1D669a2bc6B";
    const BTC_USD = "0x3A932b286715abc4A86a4ACAF68A6cdD89E0d446";
    const REJECTED_USDC = "0x7e860098f58bbfC8648a4311B374b1D669Be50Fe";

    async function codeLen(addr) {
      const code = await ethers.provider.getCode(addr);
      return (code.length - 2) / 2;
    }

    expect(await codeLen(PERMIT2)).to.be.gt(1000);
    expect(await codeLen(SAFE_L2)).to.be.gt(1000);
    expect(await codeLen(PROXY_FACTORY)).to.be.gt(100);
    expect(await codeLen(REJECTED_USDC)).to.equal(0);

    const feedAbi = [
      "function description() view returns (string)",
      "function decimals() view returns (uint8)",
      "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
    ];
    const usdc = await ethers.getContractAt(feedAbi, USDC_USD);
    expect(await usdc.description()).to.equal("USDC / USD");
    expect(await usdc.decimals()).to.equal(8);
    const usdcRound = await usdc.latestRoundData();
    expect(usdcRound[1]).to.be.gt(0);

    const btc = await ethers.getContractAt(feedAbi, BTC_USD);
    expect(await btc.description()).to.equal("BTC / USD");
    expect(await btc.decimals()).to.equal(8);
    const btcRound = await btc.latestRoundData();
    expect(btcRound[1]).to.be.gt(0);

    const permit2 = await ethers.getContractAt(
      ["function DOMAIN_SEPARATOR() view returns (bytes32)"],
      PERMIT2,
    );
    expect(await permit2.DOMAIN_SEPARATOR()).to.not.equal(ethers.ZeroHash);

    const factory = await ethers.getContractAt(
      ["function proxyCreationCode() view returns (bytes)"],
      PROXY_FACTORY,
    );
    expect((await factory.proxyCreationCode()).length).to.be.gt(2);

    await network.provider.request({ method: "hardhat_reset", params: [] });
  });
});
