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

  it("legacy path works only when permit2 unset (local/test)", async function () {
    const [owner, executor, user, feeRecipient] = await ethers.getSigners();
    const token = await ethers.deployContract("MockERC20", ["USDC", "USDC", 6]);
    const feeRouter = await ethers.deployContract("FeeRouter", [feeRecipient.address]);
    await feeRouter.wireExecutor(executor.address);
    expect(await feeRouter.permit2()).to.equal(ethers.ZeroAddress);
    const gross = 1_000n;
    await token.mint(user.address, gross);
    await token.connect(user).approve(await feeRouter.getAddress(), gross);
    await feeRouter.connect(executor).applySwapFee(await token.getAddress(), user.address, gross, ethers.id("l"));
    expect(await token.balanceOf(feeRecipient.address)).to.equal(10n);
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
