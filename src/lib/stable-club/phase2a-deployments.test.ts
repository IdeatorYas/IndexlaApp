import { describe, expect, it, beforeEach } from "vitest";
import { keccak256, type Address, type Hex } from "viem";
import { BASE_PERMIT2, BASE_TOKENS } from "@/lib/stable-club/verified-base-addresses";
import {
  attestPhase2aDeployments,
  canExposePhase2aExecution,
  clearPhase2aAttestationCache,
  earliestDiscoveryStartBlock,
  getTrustedPhase2aBaseManifest,
  isValidPhase2aDeployments,
  listPhase2aAttestationTargets,
  requireAttestedPhase2aDeployments,
  toPublicPhase2aDeploymentsPayload,
  type Phase2aCodeClient,
  type StableClubPhase2aDeployments,
  type TrustedPhase2aBaseManifest,
} from "@/lib/stable-club/phase2a-deployments";

const ADDR = "0x2222222222222222222222222222222222222222" as Address;
const MOCK_P2 = "0x1111111111111111111111111111111111111111" as Address;
const CODE_A = "0x6001600155" as Hex;
const CODE_B = "0x6002600255" as Hex;

function phase2aFixture(
  overrides: Partial<StableClubPhase2aDeployments> = {},
): StableClubPhase2aDeployments {
  const adapter = {
    poolId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hex,
    protocol: "mock",
    adapter: ADDR,
    tokenA: ADDR,
    tokenB: ADDR,
    factory: ADDR,
    npm: ADDR,
    router: ADDR,
  };
  return {
    chainId: 31337,
    network: "hardhat-local",
    isTestOnly: true,
    label: "test",
    deployedAt: "2026-01-01T00:00:00.000Z",
    deployer: ADDR,
    testUser: ADDR,
    feeRecipient: ADDR,
    permissionRegistry: ADDR,
    strategyRegistry: ADDR,
    feeRouter: ADDR,
    swapRouter: ADDR,
    clExecutor: ADDR,
    oracleGuard: ADDR,
    mevGuard: ADDR,
    safetyController: ADDR,
    permit2: MOCK_P2,
    canonicalBasePermit2: BASE_PERMIT2.address,
    usdc: ADDR,
    cbbtc: ADDR,
    weth: ADDR,
    poolIds: [
      "0x1111111111111111111111111111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222222222222222222222222222",
      "0x3333333333333333333333333333333333333333333333333333333333333333",
      "0x4444444444444444444444444444444444444444444444444444444444444444",
      "0x5555555555555555555555555555555555555555555555555555555555555555",
    ],
    adapters: [adapter, adapter, adapter, adapter, adapter],
    routes: [],
    strategyKind: "0x6666666666666666666666666666666666666666666666666666666666666666",
    rpcUrl: "http://127.0.0.1:8545",
    ...overrides,
  };
}

function addr(n: number): Address {
  return `0x${n.toString(16).padStart(40, "0")}` as Address;
}

function basePhase2aFixture(
  overrides: Partial<StableClubPhase2aDeployments> = {},
): StableClubPhase2aDeployments {
  const adapters = [1, 2, 3, 4, 5].map((i) => ({
    poolId: `0x${i.toString(16).padStart(64, "0")}` as Hex,
    protocol: "uniswap-v3",
    adapter: addr(0x10 + i),
    tokenA: BASE_TOKENS.usdc,
    tokenB: BASE_TOKENS.cbBtc,
    factory: addr(0x20),
    npm: addr(0x21),
    router: addr(0x22),
  }));
  return phase2aFixture({
    chainId: 8453,
    network: "base",
    isTestOnly: false,
    permit2: BASE_PERMIT2.address,
    canonicalBasePermit2: BASE_PERMIT2.address,
    usdc: BASE_TOKENS.usdc,
    cbbtc: BASE_TOKENS.cbBtc,
    weth: BASE_TOKENS.weth,
    permissionRegistry: addr(0x31),
    strategyRegistry: addr(0x32),
    feeRouter: addr(0x33),
    swapRouter: addr(0x34),
    clExecutor: addr(0x35),
    oracleGuard: addr(0x36),
    mevGuard: addr(0x37),
    safetyController: addr(0x38),
    adapters: adapters as StableClubPhase2aDeployments["adapters"],
    ...overrides,
  });
}

function syntheticTrustedBase(
  deployments: StableClubPhase2aDeployments,
  codeByAddress: Record<string, Hex>,
): TrustedPhase2aBaseManifest {
  const runtimeCodeHashes: Record<string, Hex> = {};
  for (const [a, code] of Object.entries(codeByAddress)) {
    runtimeCodeHashes[a.toLowerCase()] = keccak256(code);
  }
  return {
    chainId: 8453,
    network: "base",
    isTestOnly: false,
    contracts: {
      permissionRegistry: deployments.permissionRegistry,
      strategyRegistry: deployments.strategyRegistry,
      feeRouter: deployments.feeRouter,
      swapRouter: deployments.swapRouter,
      clExecutor: deployments.clExecutor,
      oracleGuard: deployments.oracleGuard,
      mevGuard: deployments.mevGuard,
      safetyController: deployments.safetyController,
      permit2: deployments.permit2,
      usdc: deployments.usdc,
      cbbtc: deployments.cbbtc,
      weth: deployments.weth,
      adapters: [
        deployments.adapters[0]!.adapter,
        deployments.adapters[1]!.adapter,
        deployments.adapters[2]!.adapter,
        deployments.adapters[3]!.adapter,
        deployments.adapters[4]!.adapter,
      ],
    },
    runtimeCodeHashes,
  };
}

function mockClient(params: {
  chainId: number;
  codeByAddress?: Record<string, Hex | undefined>;
  defaultCode?: Hex | undefined;
  failRpc?: boolean;
}): Phase2aCodeClient {
  return {
    getChainId: async () => {
      if (params.failRpc) throw new Error("RPC down");
      return params.chainId;
    },
    getBytecode: async ({ address }) => {
      if (params.failRpc) throw new Error("RPC down");
      const key = address.toLowerCase();
      if (params.codeByAddress && key in params.codeByAddress) {
        return params.codeByAddress[key];
      }
      return params.defaultCode;
    },
  };
}

describe("SC-F04 — discoveryStartBlock persistence", () => {
  it("selects the earliest confirmed deployment receipt block and rejects invalid inputs", () => {
    expect(earliestDiscoveryStartBlock([42, 7, 19])).toBe(7);
    expect(earliestDiscoveryStartBlock([BigInt(100), "88"])).toBe(88);
    expect(() => earliestDiscoveryStartBlock([])).toThrow(
      /requires at least one deployment receipt block/,
    );
    expect(() => earliestDiscoveryStartBlock([0])).toThrow(/Invalid deployment receipt block/);
    expect(() => earliestDiscoveryStartBlock([-1])).toThrow(/Invalid deployment receipt block/);
  });

  it("survives public payload conversion from parsed deployment JSON", () => {
    const parsed = phase2aFixture({ discoveryStartBlock: 17 }) as StableClubPhase2aDeployments;
    const publicPayload = toPublicPhase2aDeploymentsPayload(parsed);
    expect(publicPayload.discoveryStartBlock).toBe(17);
    expect(publicPayload.discoveryStartBlock).not.toBe(1);
    expect(publicPayload.discoveryStartBlock).not.toBe(0);

    const without = toPublicPhase2aDeploymentsPayload(phase2aFixture());
    expect(without.discoveryStartBlock).toBeUndefined();
  });
});

describe("SC-F09 — Phase 2a pin and verify deployments", () => {
  beforeEach(() => {
    clearPhase2aAttestationCache();
  });

  it("valid local 31337 artifact with bytecode at all required contracts passes", async () => {
    const deployments = phase2aFixture();
    expect(isValidPhase2aDeployments(deployments)).toBe(true);
    const result = await attestPhase2aDeployments({
      client: mockClient({ chainId: 31337, defaultCode: CODE_A }),
      deployments,
    });
    expect(result.cacheKey).toContain("31337");
    expect(listPhase2aAttestationTargets(deployments).length).toBe(
      9 + 3 + 5, // core + tokens + adapters
    );
  });

  it("missing local bytecode fails", async () => {
    const deployments = phase2aFixture();
    await expect(
      attestPhase2aDeployments({
        client: mockClient({ chainId: 31337, defaultCode: "0x" }),
        deployments,
      }),
    ).rejects.toThrow(/empty bytecode/);
  });

  it("local/Base chain mismatch fails", async () => {
    const local = phase2aFixture();
    await expect(
      attestPhase2aDeployments({
        client: mockClient({ chainId: 8453, defaultCode: CODE_A }),
        deployments: local,
      }),
    ).rejects.toThrow(/chain mismatch/);

    expect(
      isValidPhase2aDeployments(
        phase2aFixture({ chainId: 8453, network: "hardhat-local" }),
      ),
    ).toBe(false);
  });

  it("Base artifact without an injected trusted manifest fails closed", async () => {
    const deployments = basePhase2aFixture();
    expect(isValidPhase2aDeployments(deployments)).toBe(true);
    await expect(
      attestPhase2aDeployments({
        client: mockClient({ chainId: 8453, defaultCode: CODE_A }),
        deployments,
        trustedBaseManifest: null,
      }),
    ).rejects.toThrow(/no source-controlled trusted Base manifest/);
  });

  it("pinned production trusted Base manifest is non-null and Base-shaped", () => {
    const trusted = getTrustedPhase2aBaseManifest();
    expect(trusted).not.toBeNull();
    expect(trusted?.chainId).toBe(8453);
    expect(trusted?.network).toBe("base");
    expect(trusted?.isTestOnly).toBe(false);
    expect(trusted?.contracts.adapters).toHaveLength(5);
  });

  it("Base address mismatch fails", async () => {
    const deployments = basePhase2aFixture();
    const codeMap: Record<string, Hex> = {};
    for (const t of listPhase2aAttestationTargets(deployments)) {
      codeMap[t.address.toLowerCase()] = CODE_A;
    }
    const trusted = syntheticTrustedBase(deployments, codeMap);
    trusted.contracts.clExecutor = addr(0x99);
    await expect(
      attestPhase2aDeployments({
        client: mockClient({ chainId: 8453, codeByAddress: codeMap }),
        deployments,
        trustedBaseManifest: trusted,
      }),
    ).rejects.toThrow(/address mismatch for clExecutor/);
  });

  it("Base runtime codehash mismatch fails", async () => {
    const deployments = basePhase2aFixture();
    const liveCodeMap: Record<string, Hex> = {};
    const wrongHashMap: Record<string, Hex> = {};
    for (const t of listPhase2aAttestationTargets(deployments)) {
      liveCodeMap[t.address.toLowerCase()] = CODE_A;
      wrongHashMap[t.address.toLowerCase()] = CODE_B;
    }
    const trusted = syntheticTrustedBase(deployments, wrongHashMap);
    await expect(
      attestPhase2aDeployments({
        client: mockClient({ chainId: 8453, codeByAddress: liveCodeMap }),
        deployments,
        trustedBaseManifest: trusted,
      }),
    ).rejects.toThrow(/runtime codehash mismatch/);
  });

  it("fully matching synthetic trusted Base manifest + bytecode passes", async () => {
    const deployments = basePhase2aFixture({ discoveryStartBlock: 12_000_000 });
    const codeMap: Record<string, Hex> = {};
    for (const t of listPhase2aAttestationTargets(deployments)) {
      codeMap[t.address.toLowerCase()] = CODE_A;
    }
    const trusted = syntheticTrustedBase(deployments, codeMap);
    const result = await attestPhase2aDeployments({
      client: mockClient({ chainId: 8453, codeByAddress: codeMap }),
      deployments,
      trustedBaseManifest: trusted,
    });
    expect(result.cacheKey).toContain("8453");
    const pub = toPublicPhase2aDeploymentsPayload(deployments);
    expect(pub.discoveryStartBlock).toBe(12_000_000);
  });

  it("transaction-capable consumer remains disabled until attestation succeeds", async () => {
    const deployments = phase2aFixture();
    let exposed: ReturnType<typeof toPublicPhase2aDeploymentsPayload> | null = null;
    expect(canExposePhase2aExecution(exposed)).toBe(false);
    expect(() => requireAttestedPhase2aDeployments(exposed)).toThrow(/not attested/);

    await expect(
      attestPhase2aDeployments({
        client: mockClient({ chainId: 31337, defaultCode: "0x" }),
        deployments,
      }),
    ).rejects.toThrow(/empty bytecode/);
    // Consumer must not assign deployments after failed attestation
    expect(canExposePhase2aExecution(exposed)).toBe(false);

    await attestPhase2aDeployments({
      client: mockClient({ chainId: 31337, defaultCode: CODE_A }),
      deployments,
    });
    exposed = toPublicPhase2aDeploymentsPayload(deployments);
    expect(canExposePhase2aExecution(exposed)).toBe(true);
    expect(requireAttestedPhase2aDeployments(exposed).clExecutor).toBe(ADDR);
  });

  it("RPC error fails closed", async () => {
    await expect(
      attestPhase2aDeployments({
        client: mockClient({ chainId: 31337, defaultCode: CODE_A, failRpc: true }),
        deployments: phase2aFixture(),
      }),
    ).rejects.toThrow(/RPC error/);
  });

  it("discoveryStartBlock remains preserved", () => {
    const pub = toPublicPhase2aDeploymentsPayload(
      phase2aFixture({ discoveryStartBlock: 42 }),
    );
    expect(pub.discoveryStartBlock).toBe(42);
  });
});
