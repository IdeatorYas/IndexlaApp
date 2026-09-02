const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  BASE_CHAIN_ID,
  ARTIFACT_VERSION,
  BASE_DEPLOY_CONFIRMATION_PHRASE,
  FORBIDDEN_AUTOMATION_CONTRACTS,
  MVP_SAFE,
  MVP_FEE,
  USDC,
  CBBTC,
  WETH,
  USDC_USD,
  CBBTC_USD,
  BTC_USD,
  WETH_USD,
  BASE_PERMIT2,
  GAS_CEILING_WEI,
  TIMELOCK_MIN_DELAY_SECONDS,
  ADAPTER_OWNERSHIP_NOTE,
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
  assertExactTimelockDelay,
  assertDeployerLacksDefaultAdminRole,
  assertOnChainWiringSnapshot,
  assertStepFlagNotTrustedAlone,
  buildEmptyDeployState,
  buildConfigurationPlan,
  computeConfigurationHash,
  assertArtifactHasNoSecrets,
  redactSecretsFromObject,
  sanitizeErrorMessage,
  buildRouteConfigs,
  buildAdapterSpecs,
  EXPECTED_POOL_COUNT,
  EXPECTED_ROUTE_COUNT,
} = require("../../scripts/stable-club/base-mainnet-deploy-guards.cjs");
const {
  assertProductionBaseRpcUrl: assertRpcPure,
  assertNotLocalEthereumClient: assertClientPure,
  isPrivateOrLoopbackIpv4,
  isPrivateOrLoopbackIpv6,
  isLocalhostHostname,
  isHostedForkHostname,
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

  it("rejects missing / HTTP / loopback / private / hosted-fork RPC without printing URL", function () {
    expect(() => assertProductionBaseRpcUrl("")).to.throw(/BASE_RPC_URL required/);
    expect(() => assertRpcPure("")).to.throw(/BASE_RPC_URL required/);
    expect(() => assertProductionBaseRpcUrl("http://rpc.example.com")).to.throw(/HTTPS/);
    expect(() => assertProductionBaseRpcUrl("https://localhost/rpc")).to.throw(/local or loopback/);
    expect(() => assertProductionBaseRpcUrl("https://rpc.localhost/rpc")).to.throw(/local or loopback/);
    expect(() => assertProductionBaseRpcUrl("https://foo.localhost/rpc")).to.throw(/local or loopback/);
    expect(() => assertProductionBaseRpcUrl("https://127.0.0.1/rpc")).to.throw(/local or loopback/);
    expect(() => assertProductionBaseRpcUrl("https://[::ffff:127.0.0.1]/rpc")).to.throw(/private or loopback/);
    expect(() => assertProductionBaseRpcUrl("https://[::ffff:10.0.0.5]/rpc")).to.throw(/private or loopback/);
    expect(() => assertProductionBaseRpcUrl("https://192.168.1.10/rpc")).to.throw(/private or loopback/);
    expect(() => assertProductionBaseRpcUrl("https://10.0.0.5/rpc")).to.throw(/private or loopback/);
    expect(() => assertProductionBaseRpcUrl("https://172.16.5.5/rpc")).to.throw(/private or loopback/);
    expect(() => assertProductionBaseRpcUrl("https://hardhat/rpc")).to.throw(/local or loopback/);
    expect(() => assertProductionBaseRpcUrl("https://anvil/rpc")).to.throw(/local or loopback/);
    expect(() => assertProductionBaseRpcUrl("https://virtual.abc.rpc.tenderly.co")).to.throw(/hosted-fork/);
    expect(() => assertProductionBaseRpcUrl("https://fork.dev.example.com")).to.throw(/hosted-fork/);
    expect(isPrivateOrLoopbackIpv4("10.1.2.3")).to.equal(true);
    expect(isPrivateOrLoopbackIpv6("::ffff:127.0.0.1")).to.equal(true);
    expect(isPrivateOrLoopbackIpv6("[::ffff:7f00:1]")).to.equal(true);
    expect(isPrivateOrLoopbackIpv6("[::ffff:a00:5]")).to.equal(true);
    expect(isLocalhostHostname("app.localhost")).to.equal(true);
    expect(isHostedForkHostname("virtual.x.rpc.tenderly.co")).to.equal(true);
    expect(() => assertProductionBaseRpcUrl(HTTPS_RPC)).to.not.throw();
    expect(() => assertProductionBaseRpcUrl("https://mainnet.base.org")).to.not.throw();
    expect(() => assertProductionBaseRpcUrl("https://base-mainnet.g.alchemy.com/v2/demo")).to.not.throw();
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

  it("plan getters, narrow redaction, and error sanitization", function () {
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

    const redacted = redactSecretsFromObject({
      privateKey: "x",
      rpcUrl: "https://x",
      tokenA: USDC,
      tokenIn: WETH,
      apiKey: "sk-or-v1-testdata",
      creationDataHash: CODEHASH,
    });
    expect(redacted.privateKey).to.equal("[REDACTED]");
    expect(redacted.rpcUrl).to.equal("[REDACTED]");
    expect(redacted.apiKey).to.equal("[REDACTED]");
    expect(redacted.tokenA).to.equal(USDC);
    expect(redacted.tokenIn).to.equal(WETH);
    expect(redacted.creationDataHash).to.equal(CODEHASH);
    expect(() => assertArtifactHasNoSecrets({ note: "https://evil" })).to.throw(/URL/);

    const sanitized = sanitizeErrorMessage(
      new Error("RPC https://user:pass@evil.example/v1 failed with Bearer sk-or-v1-abc api_key=secret"),
    );
    expect(sanitized).to.not.match(/evil\.example|sk-or-v1|user:pass|secret/);
    expect(sanitized).to.match(/REDACTED/);
  });

  it("requires exact 48h Timelock delay and rejects deployer DEFAULT_ADMIN_ROLE", function () {
    expect(TIMELOCK_MIN_DELAY_SECONDS).to.equal(48 * 3600);
    expect(() => assertExactTimelockDelay(TIMELOCK_MIN_DELAY_SECONDS)).to.not.throw();
    expect(() => assertExactTimelockDelay(47 * 3600)).to.throw(/exactly/);
    expect(() => assertExactTimelockDelay(49 * 3600)).to.throw(/exactly/);
    expect(() => assertDeployerLacksDefaultAdminRole(false)).to.not.throw();
    expect(() => assertDeployerLacksDefaultAdminRole(true)).to.throw(/DEFAULT_ADMIN_ROLE/);
  });

  it("rejects forged/stale local step flags when on-chain wiring is missing", function () {
    expect(() => assertStepFlagNotTrustedAlone(true, false)).to.throw(
      /Forged or stale local step flag/,
    );
    expect(() => assertStepFlagNotTrustedAlone(true, true)).to.not.throw();
    expect(() => assertStepFlagNotTrustedAlone(false, false)).to.not.throw();

    const routeId = buildRouteConfigs()[0].id;
    const goodSnapshot = {
      mevOracle: ADDR_A,
      feeds: {
        [USDC]: { aggregator: USDC_USD, maxStalenessSec: 48 * 3600, enabled: true },
        [CBBTC]: { aggregator: CBBTC_USD, maxStalenessSec: 4 * 3600, enabled: true },
        [WETH]: { aggregator: WETH_USD, maxStalenessSec: 4 * 3600, enabled: true },
      },
      pegMonitor: {
        referenceAggregator: BTC_USD,
        maxDeviationBps: 100,
        enabled: true,
      },
      permOpCl: true,
      permOpStrat: true,
      permRegistrar: true,
      stratOpCl: true,
      feeExec: true,
      swapExec: true,
      clPermit2: BASE_PERMIT2,
      feePermit2: BASE_PERMIT2,
      approvedTokens: { [USDC]: true, [CBBTC]: true, [WETH]: true },
      routes: {
        [routeId]: {
          enabled: true,
          router: ADDR_B,
          pool: ADDR_A,
          tokenIn: USDC,
          tokenOut: CBBTC,
        },
      },
      approvedAdapters: { [ADDR_A]: true },
      poolAdapters: { ["0x01"]: ADDR_A },
      adapterExecutors: { [ADDR_A]: ADDR_B },
      guardian: GUARDIAN,
      maxGasPriceWei: GAS_CEILING_WEI,
    };
    const expected = {
      oracleGuard: ADDR_A,
      permit2: BASE_PERMIT2,
      clExecutor: ADDR_B,
      guardian: GUARDIAN,
      gasCeilingWei: GAS_CEILING_WEI,
      feeds: {
        [USDC]: { aggregator: USDC_USD, maxStalenessSec: 48 * 3600 },
        [CBBTC]: { aggregator: CBBTC_USD, maxStalenessSec: 4 * 3600 },
        [WETH]: { aggregator: WETH_USD, maxStalenessSec: 4 * 3600 },
      },
      peg: { referenceAggregator: BTC_USD, maxDeviationBps: 100 },
      approvedTokens: [USDC, CBBTC, WETH],
      routes: [
        {
          id: routeId,
          name: "USDC_CBBTC_AERO_L",
          router: ADDR_B,
          pool: ADDR_A,
          tokenIn: USDC,
          tokenOut: CBBTC,
        },
      ],
      adapters: [{ adapter: ADDR_A, poolId: "0x01" }],
    };
    expect(() => assertOnChainWiringSnapshot(goodSnapshot, expected)).to.not.throw();

    const forged = {
      ...goodSnapshot,
      permOpCl: false,
    };
    expect(() => assertOnChainWiringSnapshot(forged, expected)).to.throw(
      /On-chain wiring mismatch/,
    );
  });

  it("documents adapters as non-Ownable with immutable executor binding", function () {
    expect(ADAPTER_OWNERSHIP_NOTE).to.match(/not Ownable/i);
    expect(ADAPTER_OWNERSHIP_NOTE).to.match(/executor/);
  });

  it("builds five adapter specs and four USDC routes", function () {
    expect(buildRouteConfigs()).to.have.length(EXPECTED_ROUTE_COUNT);
    expect(buildAdapterSpecs(GUARDIAN)).to.have.length(EXPECTED_POOL_COUNT);
  });
});
