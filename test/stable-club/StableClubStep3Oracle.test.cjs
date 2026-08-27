const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const CBBTC = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
const USDC_USD = "0x7e860098F58bBFC8648a4311b374B1D669a2bc6B";
const CBBTC_USD = "0x07DA0E54543a844a80ABE69c8A12F22B3aA59f9D";
const BTC_USD = "0x3A932b286715abc4A86a4ACAF68A6cdD89E0d446";

describe("Step 3 — OracleGuard peg monitor (adversarial)", function () {
  async function deployGuard() {
    const [owner] = await ethers.getSigners();
    const guard = await ethers.deployContract("OracleGuard");
    const primary = await ethers.deployContract("MockAggregatorV3", [80_000n * 10n ** 8n]);
    const reference = await ethers.deployContract("MockAggregatorV3", [80_000n * 10n ** 8n]);
    return { owner, guard, primary, reference };
  }

  async function setRound(agg, answer, ts) {
    await agg.setAnswer(answer);
    await agg.setUpdatedAt(ts);
  }

  it("uses cbBTC primary vs BTC reference and passes within 1%", async function () {
    const { guard, primary, reference } = await deployGuard();
    const t = await time.latest();
    await setRound(primary, 80_000n * 10n ** 8n, t);
    await setRound(reference, 80_500n * 10n ** 8n, t); // ~0.625%

    await guard.configureFeed(CBBTC, await primary.getAddress(), 3600, 8);
    await guard.configurePegMonitor(CBBTC, await reference.getAddress(), 100, 8, true);
    await guard.configureFeed(USDC, await primary.getAddress(), 3600, 8);

    await expect(guard.assertPegOk(CBBTC)).to.not.be.reverted;
    expect(await guard.validatePrices(CBBTC, USDC, 0)).to.equal(true);
  });

  it("fails closed on excessive cbBTC/BTC deviation", async function () {
    const { guard, primary, reference } = await deployGuard();
    const t = await time.latest();
    await setRound(primary, 80_000n * 10n ** 8n, t);
    await setRound(reference, 82_000n * 10n ** 8n, t); // 2.5%

    await guard.configureFeed(CBBTC, await primary.getAddress(), 3600, 8);
    await guard.configurePegMonitor(CBBTC, await reference.getAddress(), 100, 8, true);

    await expect(guard.assertPegOk(CBBTC)).to.be.revertedWithCustomError(
      guard,
      "PegDeviationTooHigh",
    );
  });

  it("fails closed on stale primary feed", async function () {
    const { guard, primary, reference } = await deployGuard();
    const t0 = await time.latest();
    await setRound(primary, 80_000n * 10n ** 8n, t0);
    await setRound(reference, 80_000n * 10n ** 8n, t0);
    await guard.configureFeed(CBBTC, await primary.getAddress(), 100, 8);
    await guard.configurePegMonitor(CBBTC, await reference.getAddress(), 100, 8, true);

    await time.increase(200);
    await expect(guard.getPriceE8(CBBTC)).to.be.revertedWithCustomError(guard, "StaleFeed");
  });

  it("fails closed on invalid zero answers", async function () {
    const { guard, primary } = await deployGuard();
    await setRound(primary, 0n, await time.latest());
    await guard.configureFeed(USDC, await primary.getAddress(), 3600, 8);
    await expect(guard.getPriceE8(USDC)).to.be.revertedWithCustomError(guard, "InvalidRound");
  });

  it("default max deviation is 1% (100 bps)", async function () {
    const { guard } = await deployGuard();
    expect(await guard.defaultMaxDeviationBps()).to.equal(100);
  });
});

describe("Step 3 — Base fork oracle feeds (USDC / cbBTC / BTC)", function () {
  this.timeout(180_000);

  it("verifies descriptions, freshness and distinct cbBTC vs BTC feeds", async function () {
    if (!process.env.BASE_RPC_URL?.trim()) this.skip();
    await network.provider.request({
      method: "hardhat_reset",
      params: [{ forking: { jsonRpcUrl: process.env.BASE_RPC_URL } }],
    });
    await network.provider.send("evm_mine", []);

    const feedAbi = [
      "function description() view returns (string)",
      "function decimals() view returns (uint8)",
      "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
    ];

    async function codeLen(addr) {
      return ((await ethers.provider.getCode(addr)).length - 2) / 2;
    }

    expect(await codeLen(USDC_USD)).to.be.gt(1000);
    expect(await codeLen(CBBTC_USD)).to.be.gt(1000);
    expect(await codeLen(BTC_USD)).to.be.gt(1000);
    expect(CBBTC_USD.toLowerCase()).to.not.equal(BTC_USD.toLowerCase());

    const usdc = await ethers.getContractAt(feedAbi, USDC_USD);
    const cbbtc = await ethers.getContractAt(feedAbi, CBBTC_USD);
    const btc = await ethers.getContractAt(feedAbi, BTC_USD);

    expect(await usdc.description()).to.equal("USDC / USD");
    expect(await cbbtc.description()).to.equal("cbBTC / USD");
    expect(await btc.description()).to.equal("BTC / USD");
    expect(await usdc.decimals()).to.equal(8);
    expect(await cbbtc.decimals()).to.equal(8);
    expect(await btc.decimals()).to.equal(8);

    const ur = await usdc.latestRoundData();
    const cr = await cbbtc.latestRoundData();
    const br = await btc.latestRoundData();
    expect(ur[1]).to.be.gt(0);
    expect(cr[1]).to.be.gt(0);
    expect(br[1]).to.be.gt(0);

    // Spot deviation sanity: |cbBTC - BTC| / BTC should be well under 5% in healthy markets.
    const c = BigInt(cr[1]);
    const b = BigInt(br[1]);
    const diff = c > b ? c - b : b - c;
    expect(diff * 10_000n < b * 500n).to.equal(true);

    const guard = await ethers.deployContract("OracleGuard");
    await guard.configureFeed(USDC, USDC_USD, 48 * 3600, 8);
    await guard.configureFeed(CBBTC, CBBTC_USD, 4 * 3600, 8);
    await guard.configurePegMonitor(CBBTC, BTC_USD, 100, 8, true);

    expect(await guard.getPriceE8(USDC)).to.be.gt(0);
    expect(await guard.getPriceE8(CBBTC)).to.be.gt(0);
    // Live peg may or may not be within 1% — only assert call path succeeds or reverts cleanly.
    try {
      await guard.assertPegOk.staticCall(CBBTC);
    } catch (e) {
      expect(String(e.message)).to.match(/PegDeviationTooHigh|StaleFeed|InvalidRound/);
    }

    await network.provider.request({ method: "hardhat_reset", params: [] });
  });
});
