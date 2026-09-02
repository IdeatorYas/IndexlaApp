const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  BASE_CHAIN_ID,
  ARTIFACT_VERSION,
  BASE_DEPLOY_CONFIRMATION_PHRASE,
  FORBIDDEN_AUTOMATION_CONTRACTS,
  MVP_SAFE,
  MVP_FEE,
  assertBaseChainId,
  assertConfirmationPhrase,
  assertDeployerPrivateKeyPresent,
  assertBaseRpcConfigured,
  assertProductionBaseRpcUrl,
  assertNotLocalEthereumClient,
  assertGuardianAddress,
  assertAutomationDisabled,
  assertContractNotForbidden,
  assertReceiptSuccess,
  assertNoPoolActivation,
  assertUniqueContractAddresses,
  assertDeployedContractEvidence,
  assertResumeIdentityBinding,
  assertContractPlanGetters,
  buildEmptyDeployState,
  buildConfigurationPlan,
  computeConfigurationHash,
  assertArtifactHasNoSecrets,
  redactSecretsFromObject,
  buildRouteConfigs,
  buildAdapterSpecs,
  EXPECTED_POOL_COUNT,
  EXPECTED_ROUTE_COUNT,
} = require("../../scripts/stable-club/base-mainnet-deploy-guards.cjs");
const {
  assertProductionBaseRpcUrl: assertRpcPure,
  assertNotLocalEthereumClient: assertClientPure,
  isPrivateOrLoopbackIpv4,
} = require("../../scripts/stable-club/base-rpc-url-guards.cjs");
const { assertBroadcastAllowed } = require("../../scripts/stable-club/deploy-base-mainnet.cjs");

const FAKE_KEY = `0x${"11".repeat(32)}`;
const GUARDIAN = "0x1111111111111111111111111111111111111111";
const DEPLOYER = "0x2222222222222222222222222222222222222222";
const ADDR_A = "0x3333333333333333333333333333333333333333";
const ADDR_B = "0x4444444444444444444444444444444444444444";
const TX = `0x${"ab".repeat(32)}`;
const BLOCK = `0x${"cd".repeat(32)}`;
const CODEHASH = `0x${"ef".repeat(32)}`;
const CREATION = `0x${"11".repeat(32)}`;
const HTTPS_RPC = "https://base-mainnet.example.invalid";

function sampleRecord(overrides = {}) {
  return {
    address: ADDR_A,
    deployTxHash: TX,
    blockNumber: 100,
    blockHash: BLOCK,
    creationDataHash: CREATION,
    runtimeCodeHash: CODEHASH,
    ...overrides,
  };
}

function sampleLive(overrides = {}) {
  const creationData = "0xdeadbeef";
  const creationDataHash = ethers.keccak256(creationData);
  return {
    expectedDeployer: DEPLOYER,
    expectedCreationData: creationData,
    liveTx: { from: DEPLOYER, data: creationData, hash: TX },
    liveReceipt: {
      status: 1,
      contractAddress: ADDR_A,
      blockNumber: 100,
      blockHash: BLOCK,
      hash: TX,
    },
    liveBlock: { number: 100, hash: BLOCK },
    liveCodeHash: CODEHASH,
    saved: sampleRecord({ creationDataHash }),
    ...overrides,
  };
}

describe("Base mainnet deploy guards — M-01 / M-02", function () {
  it("requires exact confirmation phrase", function () {
    expect(() => assertConfirmationPhrase("")).to.throw(/CONFIRMATION/);
    expect(() => assertConfirmationPhrase(BASE_DEPLOY_CONFIRMATION_PHRASE)).to.not.throw();
  });

  it("rejects wrong chainId", function () {
    expect(() => assertBaseChainId(31337)).to.throw(/8453/);
    expect(() => assertBaseChainId(8453)).to.not.throw();
  });

  it("rejects missing / HTTP / loopback / private RPC without printing URL", function () {
    expect(() => assertProductionBaseRpcUrl("")).to.throw(/BASE_RPC_URL required/);
    expect(() => assertRpcPure("")).to.throw(/BASE_RPC_URL required/);
    expect(() => assertProductionBaseRpcUrl("http://rpc.example.com")).to.throw(/HTTPS/);
    expect(() => assertProductionBaseRpcUrl("https://localhost/rpc")).to.throw(/local or loopback/);
    expect(() => assertProductionBaseRpcUrl("https://127.0.0.1/rpc")).to.throw(/local or loopback/);
    expect(() => assertProductionBaseRpcUrl("https://192.168.1.10/rpc")).to.throw(/private or loopback/);
    expect(() => assertProductionBaseRpcUrl("https://10.0.0.5/rpc")).to.throw(/private or loopback/);
    expect(() => assertProductionBaseRpcUrl("https://172.16.5.5/rpc")).to.throw(/private or loopback/);
    expect(() => assertProductionBaseRpcUrl("https://hardhat/rpc")).to.throw(/local or loopback/);
    expect(() => assertProductionBaseRpcUrl("https://anvil/rpc")).to.throw(/local or loopback/);
    expect(isPrivateOrLoopbackIpv4("10.1.2.3")).to.equal(true);
    expect(() => assertProductionBaseRpcUrl(HTTPS_RPC)).to.not.throw();
    expect(() => assertBaseRpcConfigured(HTTPS_RPC)).to.not.throw();
    try {
      assertProductionBaseRpcUrl("https://127.0.0.1/secret-path");
      expect.fail("should throw");
    } catch (e) {
      expect(String(e.message)).to.not.match(/127\.0\.0\.1|secret-path/);
    }
  });

  it("rejects Hardhat/Anvil client versions", function () {
    expect(() => assertNotLocalEthereumClient("HardhatNetwork/2.22.0")).to.throw(/Hardhat\/Anvil/);
    expect(() => assertClientPure("anvil/0.2.0")).to.throw(/Hardhat\/Anvil/);
    expect(() => assertNotLocalEthereumClient("Geth/v1.13.0")).to.not.throw();
  });

  it("requires guardian and deployer key", function () {
    expect(() => assertDeployerPrivateKeyPresent("")).to.throw(/DEPLOYER_PRIVATE_KEY/);
    expect(() => assertGuardianAddress(MVP_SAFE)).to.throw(/Safe/);
    expect(assertGuardianAddress(GUARDIAN)).to.match(/^0x/);
  });

  it("keeps harvest/compound/rebalance disabled and forbids automation contracts", function () {
    expect(() =>
      assertAutomationDisabled({
        harvestEnabled: false,
        compoundEnabled: false,
        rebalanceEnabled: false,
      }),
    ).to.not.throw();
    expect(() =>
      assertAutomationDisabled({ harvestEnabled: true, compoundEnabled: false, rebalanceEnabled: false }),
    ).to.throw(/disabled/);
    for (const name of FORBIDDEN_AUTOMATION_CONTRACTS) {
      expect(() => assertContractNotForbidden(name)).to.throw(/automation contract/);
    }
  });

  it("fails closed on failed receipts and enforces zero pool activation", function () {
    expect(() => assertReceiptSuccess({ status: 0, blockNumber: 10 }, "x")).to.throw(/Failed receipt/);
    expect(() => assertNoPoolActivation({ poolsActivated: true })).to.throw(/forbidden/);
    expect(() =>
      assertNoPoolActivation({ poolsActivated: false, activatedPoolIds: ["x"] }),
    ).to.throw(/empty/);
  });

  it("rejects duplicate addresses", function () {
    expect(() =>
      assertUniqueContractAddresses({ a: ADDR_A, b: ADDR_A }),
    ).to.throw(/Duplicate contract address/);
    expect(() => assertUniqueContractAddresses({ a: ADDR_A, b: ADDR_B })).to.not.throw();
  });

  it("rejects wrong resume address even with identical bytecode hash", function () {
    const live = sampleLive({
      liveReceipt: {
        status: 1,
        contractAddress: ADDR_B, // different address, same code hash
        blockNumber: 100,
        blockHash: BLOCK,
        hash: TX,
      },
      saved: sampleRecord({
        address: ADDR_A,
        creationDataHash: ethers.keccak256("0xdeadbeef"),
        runtimeCodeHash: CODEHASH,
      }),
      liveCodeHash: CODEHASH,
    });
    expect(() =>
      assertDeployedContractEvidence({ key: "clExecutor", ...live }),
    ).to.throw(/contractAddress mismatch/);
  });

  it("rejects wrong deployer / creation data / block / runtime hash", function () {
    const base = sampleLive();
    expect(() =>
      assertDeployedContractEvidence({
        key: "x",
        ...base,
        liveTx: { ...base.liveTx, from: ADDR_B },
      }),
    ).to.throw(/deployer mismatch/);

    expect(() =>
      assertDeployedContractEvidence({
        key: "x",
        ...base,
        expectedCreationData: "0xbeef",
      }),
    ).to.throw(/constructor/);

    expect(() =>
      assertDeployedContractEvidence({
        key: "x",
        ...base,
        liveBlock: { number: 99, hash: BLOCK },
      }),
    ).to.throw(/block header number/);

    expect(() =>
      assertDeployedContractEvidence({
        key: "x",
        ...base,
        liveCodeHash: `0x${"00".repeat(32)}`,
      }),
    ).to.throw(/runtime code hash/);
  });

  it("accepts valid authenticated resume evidence", function () {
    const live = sampleLive();
    expect(() =>
      assertDeployedContractEvidence({ key: "permissionRegistry", ...live }),
    ).to.not.throw();
  });

  it("binds resume identity and rejects legacy/tampered config hash", function () {
    const plan = buildConfigurationPlan(GUARDIAN);
    const configurationHash = computeConfigurationHash(plan);
    const state = buildEmptyDeployState({
      deployer: DEPLOYER,
      guardian: GUARDIAN,
      releaseCommit: "a".repeat(40),
    });
    expect(state.version).to.equal(ARTIFACT_VERSION);
    expect(state.identity.configurationHash).to.equal(configurationHash);

    expect(() =>
      assertResumeIdentityBinding(state, {
        releaseCommit: "a".repeat(40),
        deployer: DEPLOYER,
        governanceSafe: MVP_SAFE,
        guardian: GUARDIAN,
        feeRecipient: MVP_FEE,
        configurationHash,
      }),
    ).to.not.throw();

    expect(() =>
      assertResumeIdentityBinding({ ...state, version: 1 }, {
        releaseCommit: "a".repeat(40),
        deployer: DEPLOYER,
        governanceSafe: MVP_SAFE,
        guardian: GUARDIAN,
        feeRecipient: MVP_FEE,
        configurationHash,
      }),
    ).to.throw(/Legacy or unsupported/);

    expect(() =>
      assertResumeIdentityBinding(state, {
        releaseCommit: "a".repeat(40),
        deployer: DEPLOYER,
        governanceSafe: MVP_SAFE,
        guardian: GUARDIAN,
        feeRecipient: MVP_FEE,
        configurationHash: `0x${"00".repeat(32)}`,
      }),
    ).to.throw(/configurationHash/);

    expect(() =>
      assertResumeIdentityBinding(state, {
        releaseCommit: "b".repeat(40),
        deployer: DEPLOYER,
        governanceSafe: MVP_SAFE,
        guardian: GUARDIAN,
        feeRecipient: MVP_FEE,
        configurationHash,
      }),
    ).to.throw(/releaseCommit/);
  });

  it("assertBroadcastAllowed requires base + HTTPS RPC + secrets", function () {
    const goodEnv = {
      STABLE_CLUB_BASE_DEPLOY_CONFIRMATION: BASE_DEPLOY_CONFIRMATION_PHRASE,
      DEPLOYER_PRIVATE_KEY: FAKE_KEY,
      BASE_RPC_URL: HTTPS_RPC,
      STABLE_CLUB_GUARDIAN_ADDRESS: GUARDIAN,
    };
    expect(() => assertBroadcastAllowed(goodEnv, "hardhat", 8453)).to.throw(/network must be "base"/);
    expect(() =>
      assertBroadcastAllowed({ ...goodEnv, BASE_RPC_URL: "http://rpc.example.com" }, "base", 8453),
    ).to.throw(/HTTPS/);
    expect(() =>
      assertBroadcastAllowed({ ...goodEnv, BASE_RPC_URL: "https://127.0.0.1" }, "base", 8453),
    ).to.throw(/local|loopback|private/i);
    const ok = assertBroadcastAllowed(goodEnv, "base", 8453);
    expect(ok.guardian.toLowerCase()).to.equal(GUARDIAN.toLowerCase());
  });

  it("builds empty state with automation disabled and no activation", function () {
    const state = buildEmptyDeployState({
      deployer: DEPLOYER,
      guardian: GUARDIAN,
      releaseCommit: "c".repeat(40),
    });
    expect(state.automation).to.deep.equal({
      harvestEnabled: false,
      compoundEnabled: false,
      rebalanceEnabled: false,
    });
    expect(state.poolsActivated).to.equal(false);
    expect(state.activatedPoolIds).to.deep.equal([]);
    expect(() => assertNoPoolActivation(state)).to.not.throw();
    expect(() => assertArtifactHasNoSecrets(state)).to.not.throw();
  });

  it("plan getters and artifact redaction", function () {
    expect(() =>
      assertContractPlanGetters({
        key: "feeRouter",
        getters: { feeRecipient: MVP_FEE },
        expected: { feeRecipient: MVP_FEE },
      }),
    ).to.not.throw();
    expect(() =>
      assertContractPlanGetters({
        key: "feeRouter",
        getters: { feeRecipient: ADDR_A },
        expected: { feeRecipient: MVP_FEE },
      }),
    ).to.throw(/getter mismatch/);

    const redacted = redactSecretsFromObject({ privateKey: "x", rpcUrl: "https://x" });
    expect(redacted.privateKey).to.equal("[REDACTED]");
    expect(() => assertArtifactHasNoSecrets({ note: "https://evil" })).to.throw(/URL/);
  });

  it("builds five adapter specs and four USDC routes", function () {
    expect(buildRouteConfigs()).to.have.length(EXPECTED_ROUTE_COUNT);
    expect(buildAdapterSpecs(GUARDIAN)).to.have.length(EXPECTED_POOL_COUNT);
  });
});
