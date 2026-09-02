const { expect } = require("chai");
const {
  BASE_CHAIN_ID,
  BASE_DEPLOY_CONFIRMATION_PHRASE,
  FORBIDDEN_AUTOMATION_CONTRACTS,
  MVP_SAFE,
  MVP_FEE,
  assertBaseChainId,
  assertConfirmationPhrase,
  assertDeployerPrivateKeyPresent,
  assertBaseRpcConfigured,
  assertGuardianAddress,
  assertAutomationDisabled,
  assertContractNotForbidden,
  assertReceiptSuccess,
  assertNoPoolActivation,
  assertResumeCodeHashesMatch,
  assertResumeAddressesMatch,
  buildEmptyDeployState,
  assertArtifactHasNoSecrets,
  redactSecretsFromObject,
  buildRouteConfigs,
  buildAdapterSpecs,
  EXPECTED_POOL_COUNT,
  EXPECTED_ROUTE_COUNT,
} = require("../../scripts/stable-club/base-mainnet-deploy-guards.cjs");
const { assertBroadcastAllowed } = require("../../scripts/stable-club/deploy-base-mainnet.cjs");

const FAKE_KEY = `0x${"11".repeat(32)}`;
const GUARDIAN = "0x1111111111111111111111111111111111111111";

describe("Base mainnet deploy guards — broadcast safety", function () {
  it("requires exact confirmation phrase", function () {
    expect(() => assertConfirmationPhrase("")).to.throw(/CONFIRMATION/);
    expect(() => assertConfirmationPhrase("authorize please")).to.throw(/CONFIRMATION/);
    expect(() => assertConfirmationPhrase(BASE_DEPLOY_CONFIRMATION_PHRASE)).to.not.throw();
  });

  it("rejects wrong chainId", function () {
    expect(() => assertBaseChainId(31337)).to.throw(/8453/);
    expect(() => assertBaseChainId(1)).to.throw(/8453/);
    expect(() => assertBaseChainId(8453)).to.not.throw();
  });

  it("rejects missing deployer key and RPC without affecting phrase-only checks", function () {
    expect(() => assertDeployerPrivateKeyPresent("")).to.throw(/DEPLOYER_PRIVATE_KEY/);
    expect(() => assertDeployerPrivateKeyPresent("not-a-key")).to.throw(/format/);
    expect(() => assertDeployerPrivateKeyPresent(FAKE_KEY)).to.not.throw();
    expect(() => assertBaseRpcConfigured("")).to.throw(/BASE_RPC_URL/);
    expect(() => assertBaseRpcConfigured("http://example.invalid")).to.not.throw();
  });

  it("requires non-zero guardian distinct from Safe and fee recipient", function () {
    expect(() => assertGuardianAddress("")).to.throw(/GUARDIAN/);
    expect(() => assertGuardianAddress(MVP_SAFE)).to.throw(/Safe/);
    expect(() => assertGuardianAddress(MVP_FEE)).to.throw(/fee recipient/);
    expect(assertGuardianAddress(GUARDIAN)).to.match(/^0x/);
  });

  it("keeps harvest/compound/rebalance disabled", function () {
    expect(() =>
      assertAutomationDisabled({
        harvestEnabled: false,
        compoundEnabled: false,
        rebalanceEnabled: false,
      }),
    ).to.not.throw();
    expect(() =>
      assertAutomationDisabled({
        harvestEnabled: true,
        compoundEnabled: false,
        rebalanceEnabled: false,
      }),
    ).to.throw(/disabled/);
    expect(() =>
      assertAutomationDisabled({
        harvestEnabled: false,
        compoundEnabled: true,
        rebalanceEnabled: false,
      }),
    ).to.throw(/disabled/);
    expect(() =>
      assertAutomationDisabled({
        harvestEnabled: false,
        compoundEnabled: false,
        rebalanceEnabled: true,
      }),
    ).to.throw(/disabled/);
  });

  it("refuses forbidden automation contracts", function () {
    for (const name of FORBIDDEN_AUTOMATION_CONTRACTS) {
      expect(() => assertContractNotForbidden(name)).to.throw(/automation contract/);
    }
    expect(() => assertContractNotForbidden("StableClubSwapRouter")).to.not.throw();
    expect(() => assertContractNotForbidden("StableClubTimelock")).to.not.throw();
  });

  it("fails closed on failed receipts", function () {
    expect(() => assertReceiptSuccess(null, "x")).to.throw(/Missing receipt/);
    expect(() => assertReceiptSuccess({ status: 0, blockNumber: 10 }, "x")).to.throw(/Failed receipt/);
    expect(() => assertReceiptSuccess({ status: 1, blockNumber: 0 }, "x")).to.throw(/Invalid receipt block/);
    expect(() => assertReceiptSuccess({ status: 1n, blockNumber: 12 }, "x")).to.not.throw();
  });

  it("enforces zero pool activation", function () {
    expect(() => assertNoPoolActivation({ poolsActivated: false, activatedPoolIds: [] })).to.not.throw();
    expect(() => assertNoPoolActivation({ poolsActivated: true })).to.throw(/forbidden/);
    expect(() =>
      assertNoPoolActivation({ poolsActivated: false, activatedPoolIds: ["USDC-cbBTC-UNI-005"] }),
    ).to.throw(/empty/);
    expect(() =>
      assertNoPoolActivation({ poolsActivated: false, activatedPoolIds: [], steps: { activatePools: true } }),
    ).to.throw(/activatePools/);
  });

  it("fail-closes resume mismatches for addresses and code hashes", function () {
    expect(() =>
      assertResumeAddressesMatch(
        { contracts: { clExecutor: "0x0000000000000000000000000000000000000001" } },
        { clExecutor: "0x0000000000000000000000000000000000000002" },
      ),
    ).to.throw(/Resume mismatch/);
    expect(() =>
      assertResumeCodeHashesMatch(
        { runtimeCodeHashes: { clExecutor: "0xaaa" } },
        { clExecutor: "0xbbb" },
      ),
    ).to.throw(/code hash differs/);
    expect(() =>
      assertResumeCodeHashesMatch(
        { runtimeCodeHashes: { clExecutor: "0xaaa" } },
        { clExecutor: "0xaaa" },
      ),
    ).to.not.throw();
  });

  it("assertBroadcastAllowed requires base network + all secrets", function () {
    const goodEnv = {
      STABLE_CLUB_BASE_DEPLOY_CONFIRMATION: BASE_DEPLOY_CONFIRMATION_PHRASE,
      DEPLOYER_PRIVATE_KEY: FAKE_KEY,
      BASE_RPC_URL: "http://example.invalid",
      STABLE_CLUB_GUARDIAN_ADDRESS: GUARDIAN,
    };
    expect(() => assertBroadcastAllowed(goodEnv, "hardhat", 8453)).to.throw(/network must be "base"/);
    expect(() => assertBroadcastAllowed(goodEnv, "base", 31337)).to.throw(/8453/);
    expect(() =>
      assertBroadcastAllowed({ ...goodEnv, STABLE_CLUB_BASE_DEPLOY_CONFIRMATION: "nope" }, "base", 8453),
    ).to.throw(/CONFIRMATION/);
    expect(() =>
      assertBroadcastAllowed({ ...goodEnv, DEPLOYER_PRIVATE_KEY: "" }, "base", 8453),
    ).to.throw(/DEPLOYER_PRIVATE_KEY/);
    expect(() =>
      assertBroadcastAllowed({ ...goodEnv, STABLE_CLUB_GUARDIAN_ADDRESS: "" }, "base", 8453),
    ).to.throw(/GUARDIAN/);
    const ok = assertBroadcastAllowed(goodEnv, "base", 8453);
    expect(ok.guardian.toLowerCase()).to.equal(GUARDIAN.toLowerCase());
  });

  it("builds empty state with automation disabled and no activation", function () {
    const state = buildEmptyDeployState({ deployer: GUARDIAN, guardian: GUARDIAN });
    expect(state.automation).to.deep.equal({
      harvestEnabled: false,
      compoundEnabled: false,
      rebalanceEnabled: false,
    });
    expect(state.poolsActivated).to.equal(false);
    expect(state.activatedPoolIds).to.deep.equal([]);
    expect(state.forbiddenAutomationContracts).to.deep.equal([...FORBIDDEN_AUTOMATION_CONTRACTS]);
    expect(() => assertNoPoolActivation(state)).to.not.throw();
    expect(() => assertArtifactHasNoSecrets(state)).to.not.throw();
  });

  it("redacts secret-looking keys and rejects RPC URLs in artifacts", function () {
    const redacted = redactSecretsFromObject({
      deployer: GUARDIAN,
      privateKey: "should-not-leak",
      nested: { rpcUrl: "http://secret" },
    });
    expect(redacted.privateKey).to.equal("[REDACTED]");
    expect(redacted.nested.rpcUrl).to.equal("[REDACTED]");
    expect(() =>
      assertArtifactHasNoSecrets({ note: "ok", BASE_RPC_URL: "http://x" }),
    ).to.throw(/secret|URL/i);
    expect(() => assertArtifactHasNoSecrets({ note: "https://evil" })).to.throw(/URL/);
  });

  it("builds five adapter specs and four USDC routes", function () {
    expect(buildRouteConfigs()).to.have.length(EXPECTED_ROUTE_COUNT);
    expect(buildAdapterSpecs(GUARDIAN)).to.have.length(EXPECTED_POOL_COUNT);
  });
});
