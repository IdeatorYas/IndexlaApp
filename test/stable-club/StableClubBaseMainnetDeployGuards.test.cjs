const { expect } = require("chai");
const { ethers, artifacts } = require("hardhat");
const {
  BASE_CHAIN_ID,
  ARTIFACT_VERSION,
  BASE_DEPLOY_CONFIRMATION_PHRASE,
  FORBIDDEN_AUTOMATION_CONTRACTS,
  BASE_MAINNET_PRIVATE_BETA_CONTRACT_PLAN,
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
  assertPrivateBetaDeployPlan,
  assertReceiptSuccess,
  POST_CREATE_CODE_RETRIES,
  assertReceiptContractAddress,
  selectAuthoritativeCreateAddress,
  buildUnresolvedCreateEvidence,
  assertNoUnresolvedCreateEvidence,
  assertRuntimeBytecodeMatchesArtifact,
  collectImmutableRegions,
  verifyImmutableGetters,
  fetchRuntimeCodeWithRetries,
  formatCreateAddressLog,
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
const { assertBroadcastAllowed, finalizeCreateFromReceipt } = require("../../scripts/stable-club/deploy-base-mainnet.cjs");


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

  it("validates the private-beta CREATE plan — approved pass, forbidden fail before CREATE", function () {
    expect(BASE_MAINNET_PRIVATE_BETA_CONTRACT_PLAN).to.include.members([
      "PermissionRegistry",
      "StableClubConcentratedLiquidityExecutor",
      "UniswapV3Adapter",
      "AerodromeSlipstreamAdapter",
      "StableClubTimelock",
    ]);
    expect(() => assertPrivateBetaDeployPlan(BASE_MAINNET_PRIVATE_BETA_CONTRACT_PLAN)).to.not.throw();
    for (const name of BASE_MAINNET_PRIVATE_BETA_CONTRACT_PLAN) {
      expect(() => assertContractNotForbidden(name)).to.not.throw();
    }
    for (const forbidden of FORBIDDEN_AUTOMATION_CONTRACTS) {
      expect(BASE_MAINNET_PRIVATE_BETA_CONTRACT_PLAN).to.not.include(forbidden);
      expect(() => assertContractNotForbidden(forbidden)).to.throw(/automation contract/);
      expect(() =>
        assertPrivateBetaDeployPlan([...BASE_MAINNET_PRIVATE_BETA_CONTRACT_PLAN, forbidden]),
      ).to.throw(/automation contract/);
    }
    expect(() => assertPrivateBetaDeployPlan([])).to.throw(/missing/);
    expect(() => assertPrivateBetaDeployPlan(FORBIDDEN_AUTOMATION_CONTRACTS)).to.throw(
      /automation contract/,
    );
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
    expect(state.unresolvedCreateEvidence).to.equal(null);
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

describe("Base mainnet post-CREATE evidence hardening", function () {
  const CREATION_DATA = "0xdeadbeef";
  const CREATION_HASH = ethers.keccak256(CREATION_DATA);
  const PREDICTED = "0x5555555555555555555555555555555555555555";

  function baseState() {
    return buildEmptyDeployState({
      deployer: DEPLOYER,
      guardian: GUARDIAN,
      releaseCommit: "a".repeat(40),
    });
  }

  function mockReceipt(overrides = {}) {
    return {
      status: 1,
      hash: TX,
      contractAddress: ADDR_A,
      blockNumber: 100,
      blockHash: BLOCK,
      ...overrides,
    };
  }

  it("uses receipt.contractAddress as authoritative address", function () {
    const selected = selectAuthoritativeCreateAddress({
      receiptAddress: ADDR_A,
      predictedAddress: PREDICTED,
    });
    expect(selected.authoritative.toLowerCase()).to.equal(ADDR_A.toLowerCase());
    expect(selected.predictedMismatch).to.equal(true);
    expect(formatCreateAddressLog({
      key: "permissionRegistry",
      receiptAddress: selected.authoritative,
      predictedAddress: selected.predicted,
      predictedMismatch: selected.predictedMismatch,
      deployTxHash: TX,
      blockNumber: 100,
    }).predictedMismatch).to.equal(true);
  });

  it("blocks resume while unresolved CREATE evidence exists", function () {
    const state = baseState();
    expect(() => assertNoUnresolvedCreateEvidence(state)).to.not.throw();
    state.unresolvedCreateEvidence = buildUnresolvedCreateEvidence({
      key: "permissionRegistry",
      contractName: "PermissionRegistry",
      address: ADDR_A,
      predictedAddress: PREDICTED,
      deployTxHash: TX,
      blockNumber: 100,
      blockHash: BLOCK,
      creationDataHash: CREATION_HASH,
      constructorArgs: [],
    });
    expect(() => assertNoUnresolvedCreateEvidence(state)).to.throw(/Resume blocked: unresolved CREATE/);
    expect(state.unresolvedCreateEvidence.runtimeCodeHash).to.equal(undefined);
  });

  it("retries temporary empty eth_getCode then succeeds", async function () {
    let calls = 0;
    const code = `0x${"ab".repeat(32)}`;
    const sleeps = [];
    const got = await fetchRuntimeCodeWithRetries({
      getCode: async () => {
        calls += 1;
        return calls < 3 ? "0x" : code;
      },
      address: ADDR_A,
      blockTag: 100,
      maxAttempts: 5,
      delayMs: 1,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(got).to.equal(code);
    expect(calls).to.equal(3);
    expect(sleeps.length).to.equal(2);
    expect(POST_CREATE_CODE_RETRIES.maxAttempts).to.be.at.least(3);
  });

  it("fails closed after permanent empty code", async function () {
    let err = null;
    try {
      await fetchRuntimeCodeWithRetries({
        getCode: async () => "0x",
        address: ADDR_A,
        blockTag: 100,
        maxAttempts: 3,
        delayMs: 1,
        sleep: async () => {},
      });
    } catch (e) {
      err = e;
    }
    expect(err).to.not.equal(null);
    expect(String(err.message)).to.match(/No runtime bytecode at CREATE address after 3 attempts/);
  });

  it("normal successful CREATE promotes record and clears unresolved evidence", async function () {
    this.timeout(60_000);
    const artifact = await artifacts.readArtifact("PermissionRegistry");
    const deployed = artifact.deployedBytecode;
    const codeHash = ethers.keccak256(deployed);
    const state = baseState();
    const saves = [];
    const receipt = mockReceipt();
    const deploymentTx = { from: DEPLOYER, nonce: 7, hash: TX, data: CREATION_DATA };

    const addr = await finalizeCreateFromReceipt(
      state,
      {
        key: "permissionRegistry",
        contractName: "PermissionRegistry",
        constructorArgs: [],
        expectedCreationData: CREATION_DATA,
        expectedDeployedBytecode: deployed,
        deploymentTx,
      },
      {
        saveState: (s) => {
          saves.push(JSON.parse(JSON.stringify(s)));
        },
        waitReceipt: async () => receipt,
        sleep: async () => {},
        provider: {
          getBlock: async () => ({ number: 100, hash: BLOCK }),
          getTransaction: async () => ({
            from: DEPLOYER,
            data: CREATION_DATA,
            hash: TX,
            nonce: 7,
          }),
          getCode: async (address, blockTag) => {
            expect(ethers.getAddress(address)).to.equal(ethers.getAddress(ADDR_A));
            expect(Number(blockTag)).to.equal(100);
            return deployed;
          },
        },
        codeRetries: { maxAttempts: 2, delayMs: 1 },
      },
    );

    expect(addr.toLowerCase()).to.equal(ADDR_A.toLowerCase());
    expect(state.unresolvedCreateEvidence).to.equal(null);
    expect(state.deploymentRecords.permissionRegistry.address.toLowerCase()).to.equal(
      ADDR_A.toLowerCase(),
    );
    expect(state.deploymentRecords.permissionRegistry.runtimeCodeHash).to.equal(codeHash);
    expect(state.contracts.permissionRegistry.toLowerCase()).to.equal(ADDR_A.toLowerCase());
    // First save must preserve unresolved evidence before promotion.
    expect(saves[0].unresolvedCreateEvidence.status).to.equal("unresolved");
    expect(saves[0].deploymentRecords.permissionRegistry).to.equal(undefined);
    expect(saves[saves.length - 1].unresolvedCreateEvidence).to.equal(null);
  });

  it("temporary empty code then success still promotes", async function () {
    this.timeout(60_000);
    const artifact = await artifacts.readArtifact("PermissionRegistry");
    const deployed = artifact.deployedBytecode;
    const state = baseState();
    let calls = 0;
    await finalizeCreateFromReceipt(
      state,
      {
        key: "permissionRegistry",
        contractName: "PermissionRegistry",
        constructorArgs: [],
        expectedCreationData: CREATION_DATA,
        expectedDeployedBytecode: deployed,
        deploymentTx: { from: DEPLOYER, nonce: 1, hash: TX, data: CREATION_DATA },
      },
      {
        saveState: () => {},
        waitReceipt: async () => mockReceipt(),
        sleep: async () => {},
        provider: {
          getBlock: async () => ({ number: 100, hash: BLOCK }),
          getTransaction: async () => ({
            from: DEPLOYER,
            data: CREATION_DATA,
            hash: TX,
            nonce: 1,
          }),
          getCode: async () => {
            calls += 1;
            return calls === 1 ? "0x" : deployed;
          },
        },
        codeRetries: { maxAttempts: 4, delayMs: 1 },
      },
    );
    expect(calls).to.be.at.least(2);
    expect(state.unresolvedCreateEvidence).to.equal(null);
    expect(state.deploymentRecords.permissionRegistry).to.exist;
  });

  it("permanent empty code preserves unresolved recovery evidence", async function () {
    this.timeout(60_000);
    const artifact = await artifacts.readArtifact("PermissionRegistry");
    const state = baseState();
    const saves = [];
    let err = null;
    try {
      await finalizeCreateFromReceipt(
        state,
        {
          key: "permissionRegistry",
          contractName: "PermissionRegistry",
          constructorArgs: [],
          expectedCreationData: CREATION_DATA,
          expectedDeployedBytecode: artifact.deployedBytecode,
          deploymentTx: { from: DEPLOYER, nonce: 3, hash: TX, data: CREATION_DATA },
        },
        {
          saveState: (s) => {
            saves.push(JSON.parse(JSON.stringify(s)));
          },
          waitReceipt: async () => mockReceipt(),
          sleep: async () => {},
          provider: {
            getBlock: async () => ({ number: 100, hash: BLOCK }),
            getTransaction: async () => ({
              from: DEPLOYER,
              data: CREATION_DATA,
              hash: TX,
              nonce: 3,
            }),
            getCode: async () => "0x",
          },
          codeRetries: { maxAttempts: 3, delayMs: 1 },
        },
      );
    } catch (e) {
      err = e;
    }
    expect(err).to.not.equal(null);
    expect(String(err.message)).to.match(/No runtime bytecode/);
    expect(state.unresolvedCreateEvidence).to.not.equal(null);
    expect(state.unresolvedCreateEvidence.status).to.equal("unresolved");
    expect(state.unresolvedCreateEvidence.address.toLowerCase()).to.equal(ADDR_A.toLowerCase());
    expect(state.deploymentRecords.permissionRegistry).to.equal(undefined);
    expect(saves.some((s) => s.unresolvedCreateEvidence?.status === "unresolved")).to.equal(true);
    expect(() => assertNoUnresolvedCreateEvidence(state)).to.throw(/Resume blocked/);
  });

  it("receipt address wins on predicted mismatch and still verifies receipt address", async function () {
    this.timeout(60_000);
    const artifact = await artifacts.readArtifact("PermissionRegistry");
    const deployed = artifact.deployedBytecode;
    const state = baseState();
    const queried = [];
    // deploymentTx nonce predicts PREDICTED-like address; receipt returns ADDR_A
    const deploymentTx = { from: DEPLOYER, nonce: 0, hash: TX, data: CREATION_DATA };
    const predicted = ethers.getCreateAddress({ from: DEPLOYER, nonce: 0 });
    expect(predicted.toLowerCase()).to.not.equal(ADDR_A.toLowerCase());

    const addr = await finalizeCreateFromReceipt(
      state,
      {
        key: "permissionRegistry",
        contractName: "PermissionRegistry",
        constructorArgs: [],
        expectedCreationData: CREATION_DATA,
        expectedDeployedBytecode: deployed,
        deploymentTx,
      },
      {
        saveState: () => {},
        waitReceipt: async () => mockReceipt({ contractAddress: ADDR_A }),
        sleep: async () => {},
        provider: {
          getBlock: async () => ({ number: 100, hash: BLOCK }),
          getTransaction: async () => ({
            from: DEPLOYER,
            data: CREATION_DATA,
            hash: TX,
            nonce: 0,
          }),
          getCode: async (address) => {
            queried.push(ethers.getAddress(address));
            return deployed;
          },
        },
        codeRetries: { maxAttempts: 2, delayMs: 1 },
      },
    );
    expect(addr.toLowerCase()).to.equal(ADDR_A.toLowerCase());
    expect(queried.every((a) => a.toLowerCase() === ADDR_A.toLowerCase())).to.equal(true);
    expect(queried.some((a) => a.toLowerCase() === predicted.toLowerCase())).to.equal(false);
  });

  it("assertRuntimeBytecodeMatchesArtifact rejects mismatch (no immutables)", function () {
    const a = `0x${"11".repeat(32)}`;
    const b = `0x${"22".repeat(32)}`;
    expect(() => assertRuntimeBytecodeMatchesArtifact(a, b)).to.throw(/does not match artifact/);
    expect(assertRuntimeBytecodeMatchesArtifact(a, a)).to.equal(ethers.keccak256(a));
  });

  it("assertRuntimeBytecodeMatchesArtifact passes with immutables and matching skeleton", function () {
    // 64 bytes of bytecode, immutable region at bytes 16..32
    const skeleton = "aa".repeat(16) + "00".repeat(16) + "bb".repeat(32);
    const artifactCode = `0x${skeleton}`;
    const liveCode = `0x${"aa".repeat(16) + "ff".repeat(16) + "bb".repeat(32)}`;
    const immutableReferences = { "42": [{ start: 16, length: 16 }] };
    // Should pass — non-immutable regions match
    const hash = assertRuntimeBytecodeMatchesArtifact(liveCode, artifactCode, immutableReferences);
    expect(hash).to.equal(ethers.keccak256(liveCode));
  });

  it("assertRuntimeBytecodeMatchesArtifact rejects tampered non-immutable bytecode", function () {
    const artifactCode = `0x${"aa".repeat(16) + "00".repeat(16) + "bb".repeat(32)}`;
    const tamperedCode = `0x${"cc".repeat(16) + "ff".repeat(16) + "bb".repeat(32)}`;
    const immutableReferences = { "42": [{ start: 16, length: 16 }] };
    expect(() =>
      assertRuntimeBytecodeMatchesArtifact(tamperedCode, artifactCode, immutableReferences),
    ).to.throw(/skeleton does not match/);
  });

  it("assertRuntimeBytecodeMatchesArtifact rejects length mismatch with immutables", function () {
    const short = `0x${"aa".repeat(10)}`;
    const long = `0x${"aa".repeat(20)}`;
    const immutableReferences = { "1": [{ start: 0, length: 4 }] };
    expect(() =>
      assertRuntimeBytecodeMatchesArtifact(short, long, immutableReferences),
    ).to.throw(/length mismatch/);
  });

  it("assertReceiptContractAddress rejects missing CREATE address", function () {
    expect(() =>
      assertReceiptContractAddress({ status: 1, blockNumber: 1, contractAddress: null }, "x"),
    ).to.throw(/missing contractAddress/);
  });

  // === M1: RPC failure immediately after receipt leaves evidence ===
  it("finalizeCreateFromReceipt persists evidence before getBlock and survives RPC failure", async function () {
    const saved = [];
    const dtx = { from: DEPLOYER, nonce: 10, hash: TX, data: CREATION_DATA };
    const state = { deployer: DEPLOYER, contracts: {}, unresolvedCreateEvidence: null };
    try {
      await finalizeCreateFromReceipt(
        state,
        {
          key: "test",
          contractName: "Test",
          constructorArgs: [],
          expectedCreationData: CREATION_DATA,
          expectedDeployedBytecode: `0x${"aa".repeat(32)}`,
          deploymentTx: dtx,
        },
        {
          saveState: (s) => saved.push(JSON.parse(JSON.stringify(s))),
          waitReceipt: async () => mockReceipt({ contractAddress: ADDR_A }),
          sleep: async () => {},
          provider: {
            getBlock: async () => { throw new Error("RPC down after receipt"); },
            getTransaction: async () => null,
            getCode: async () => "0x",
          },
          codeRetries: { maxAttempts: 1, delayMs: 1 },
        },
      );
      expect.fail("should have thrown");
    } catch (e) {
      expect(e.message).to.include("RPC down after receipt");
    }
    // Evidence must have been saved BEFORE the RPC failure
    expect(saved.length).to.be.at.least(1);
    expect(saved[0].unresolvedCreateEvidence).to.not.equal(null);
    expect(saved[0].unresolvedCreateEvidence.key).to.equal("test");
    expect(saved[0].unresolvedCreateEvidence.address.toLowerCase()).to.equal(ADDR_A.toLowerCase());
    expect(saved[0].unresolvedCreateEvidence.status).to.equal("unresolved");
  });

  // === M2: malformed and unexpected evidence status blocks resume ===
  it("assertNoUnresolvedCreateEvidence blocks on status=resolved (malformed)", function () {
    expect(() =>
      assertNoUnresolvedCreateEvidence({ unresolvedCreateEvidence: { status: "resolved", key: "x" } }),
    ).to.throw(/Resume blocked/);
  });

  it("assertNoUnresolvedCreateEvidence blocks on empty object", function () {
    expect(() =>
      assertNoUnresolvedCreateEvidence({ unresolvedCreateEvidence: {} }),
    ).to.throw(/Resume blocked/);
  });

  it("assertNoUnresolvedCreateEvidence blocks on truthy non-object", function () {
    expect(() =>
      assertNoUnresolvedCreateEvidence({ unresolvedCreateEvidence: "stale" }),
    ).to.throw(/Resume blocked/);
  });

  it("assertNoUnresolvedCreateEvidence allows null", function () {
    expect(() => assertNoUnresolvedCreateEvidence({ unresolvedCreateEvidence: null })).to.not.throw();
  });

  it("assertNoUnresolvedCreateEvidence allows undefined/absent", function () {
    expect(() => assertNoUnresolvedCreateEvidence({})).to.not.throw();
  });

  // === Atomic promotion clears evidence ===
  it("finalizeCreateFromReceipt clears evidence atomically on success", async function () {
    const saved = [];
    const deployed = `0x${"aa".repeat(32)}`;
    const dtx2 = { from: DEPLOYER, nonce: 11, hash: TX, data: CREATION_DATA };
    const state = { deployer: DEPLOYER, contracts: {}, runtimeCodeHashes: {}, deploymentRecords: {}, txHashes: [], steps: {}, unresolvedCreateEvidence: null };
    await finalizeCreateFromReceipt(
      state,
      {
        key: "atomic",
        contractName: "Test",
        constructorArgs: [],
        expectedCreationData: CREATION_DATA,
        expectedDeployedBytecode: deployed,
        deploymentTx: dtx2,
      },
      {
        saveState: (s) => saved.push(JSON.parse(JSON.stringify(s))),
        waitReceipt: async () => mockReceipt({ contractAddress: ADDR_A }),
        sleep: async () => {},
        provider: {
          getBlock: async () => ({ number: 100, hash: BLOCK }),
          getTransaction: async () => ({
            from: DEPLOYER,
            data: CREATION_DATA,
            hash: TX,
            nonce: 0,
          }),
          getCode: async () => deployed,
        },
        codeRetries: { maxAttempts: 1, delayMs: 1 },
      },
    );
    // Final save must have null evidence (cleared atomically with deployment record)
    const finalSave = saved[saved.length - 1];
    expect(finalSave.unresolvedCreateEvidence).to.equal(null);
    expect(finalSave.contracts.atomic).to.not.equal(undefined);
  });

  // === verifyImmutableGetters ===
  it("verifyImmutableGetters passes when all getters match", async function () {
    await verifyImmutableGetters([
      { getter: async () => "0xabc", expected: "0xABC", label: "pool" },
      { getter: async () => 42n, expected: 42n, label: "fee" },
    ]);
  });

  it("verifyImmutableGetters rejects incorrect immutable value", async function () {
    try {
      await verifyImmutableGetters([
        { getter: async () => "0xdead", expected: "0xbeef", label: "router" },
      ]);
      expect.fail("should have thrown");
    } catch (e) {
      expect(e.message).to.include("Immutable getter mismatch");
      expect(e.message).to.include("router");
    }
  });
});
