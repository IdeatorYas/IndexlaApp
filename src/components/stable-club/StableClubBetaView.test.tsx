import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { StableClubBetaView } from "@/components/stable-club/StableClubBetaView";
import { OFFICIAL_STABLE_CLUB_BASE_POOLS } from "@/lib/stable-club/official-pools";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

const connect = vi.fn();
const exitAll = vi.fn();
const harvestAll = vi.fn();
const compoundAll = vi.fn();
const exitAllToUsdc = vi.fn();
const refreshPositions = vi.fn();

let walletState = {
  status: "disconnected" as "disconnected" | "connecting" | "connected",
  chainId: null as number | null,
  address: null as string | null,
  error: null as string | null,
  connect,
  switchToBase: vi.fn(),
};

let positionsState = {
  deploymentsLoading: false,
  deployments: {
    network: "base" as const,
    chainId: 8453,
    features: { exitAllToUsdc: true },
  },
  deploymentsError: null as string | null,
  onExpectedChain: true,
  expectedChainId: 8453,
  strategyId: null as string | null,
  strategyRegistered: false,
  strategyRevoked: false,
  strategyExpired: false,
  positions: [] as Array<{
    legIndex: number;
    poolId: `0x${string}`;
    poolLabel: string;
    positionTokenId: bigint;
    amountA: bigint;
    amountB: bigint;
    tokenASymbol: string;
    tokenBSymbol: string;
    allocationBps: bigint;
    liquidity: bigint;
    rangeStatus: string;
    tokenA?: `0x${string}`;
    tokenB?: `0x${string}`;
    protocol?: string;
    npm?: `0x${string}`;
    adapter?: `0x${string}`;
    nftContract?: `0x${string}`;
  }>,
  positionsLoading: false,
  positionsError: null as string | null,
  stale: false,
  progress: "idle" as const,
  statusMessage: null as string | null,
  error: null as string | null,
  lastTxHash: null as string | null,
  explorerUrl: null as string | null,
  approvalTxHashes: [] as string[],
  legResults: [] as unknown[],
  directPlan: null,
  busy: false,
  refreshPositions,
  exitIndividual: vi.fn(),
  exitAll,
  exitAllToUsdc,
  exitAllToUsdcAvailable: true,
  harvestAll,
  compoundAll,
  emergencyExitLeg: vi.fn(),
  emergencyExitAllSequential: vi.fn(),
  revokeStrategy: vi.fn(),
  showDirectExitPlan: vi.fn(),
};

vi.mock("@/components/stable-club/useStableClubBetaReadiness", () => ({
  useStableClubBetaReadiness: () => ({
    readiness: {
      depositsEnabled: true,
      exitAllToUsdcAvailable: true,
      depositBlockers: [] as string[],
      globalStatus: "Ready",
    },
    loading: false,
    error: null,
    isLocalHardhat: false,
  }),
}));

vi.mock("@/components/stable-club/useFivePoolDeposit", () => ({
  useFivePoolDeposit: () => ({
    deploymentsLoading: false,
    deployments: { network: "base", chainId: 8453, features: { exitAllToUsdc: true } },
    deploymentsError: null,
    amountInput: "20",
    setAmountInput: vi.fn(),
    invalidatePlan: vi.fn(),
    depositIntoFivePoolStrategy: vi.fn(),
    progress: "idle",
    statusMessage: null,
    error: null,
    lastTxHash: null,
    explorerUrl: null,
    onExpectedChain: true,
    expectedChainId: 8453,
    busy: false,
    wallet: { address: "0xabc", chainId: 8453 },
  }),
}));

vi.mock("@/components/wallet/StableClubWalletProvider", () => ({
  useStableClubWallet: () => walletState,
}));

vi.mock("@/components/stable-club/useStableClubPoolApy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/stable-club/useStableClubPoolApy")>();
  return {
    ...actual,
    useStableClubPoolApyMap: () => ({ byPoolId: {}, loading: false, fetchedAt: null, source: null }),
  };
});

vi.mock("@/components/stable-club/useFivePoolPositions", () => ({
  useFivePoolPositions: () => positionsState,
}));

vi.mock("@/components/stable-club/usePositionClaimableFees", () => ({
  usePositionClaimableFees: () => ({ rows: [], totalApproxUsdc: 0, loading: false }),
}));

vi.mock("@/components/stable-club/usePositionUsdValue", () => ({
  usePositionUsdValue: () => ({ rows: [], totalUsdc: null, loading: false }),
}));

describe("StableClubBetaView", () => {
  afterEach(() => {
    cleanup();
    connect.mockReset();
    exitAll.mockReset();
    harvestAll.mockReset();
    compoundAll.mockReset();
    exitAllToUsdc.mockReset();
    refreshPositions.mockReset();
    walletState = {
      status: "disconnected",
      chainId: null,
      address: null,
      error: null,
      connect,
      switchToBase: vi.fn(),
    };
    positionsState = {
      ...positionsState,
      positions: [],
      positionsLoading: false,
      strategyRegistered: false,
      strategyRevoked: false,
      strategyExpired: false,
      busy: false,
      statusMessage: null,
      error: null,
    };
  });

  it("disconnected: shows only Connect Wallet", () => {
    render(<StableClubBetaView />);
    expect(screen.getByRole("button", { name: "Connect Wallet" })).toBeInTheDocument();
    expect(screen.queryByText("My Stable Club Position")).toBeNull();
    expect(screen.queryByText("Deposit USDC")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Connect Wallet" }));
    expect(connect).toHaveBeenCalled();
  });

  it("connected with no positions: defaults to Available Pools with Deposit USDC", () => {
    walletState = {
      status: "connected",
      chainId: 8453,
      address: "0xab4e242C5b489e8301408C93003903364214559F",
      error: null,
      connect,
      switchToBase: vi.fn(),
    };
    render(<StableClubBetaView />);
    expect(screen.getByRole("tab", { name: "Available Pools" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "My Position" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(screen.getByRole("heading", { name: "TOP BASE CHAIN LPs" })).toBeInTheDocument();
    expect(screen.getByText("LIVE BETA")).toBeInTheDocument();
    expect(screen.getByText(/One USDC deposit · Five LP positions · 20% each/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Deposit USDC" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deposit USDC" })).toBeEnabled();
    expect(screen.queryByText(/Risk/i)).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "My Position" }));
    expect(screen.getByRole("heading", { name: "Deposit USDC" })).toBeInTheDocument();
  });

  it("connected with positions: four action buttons and always-clickable tabs", () => {
    walletState = {
      status: "connected",
      chainId: 8453,
      address: "0xab4e242C5b489e8301408C93003903364214559F",
      error: null,
      connect,
      switchToBase: vi.fn(),
    };
    positionsState = {
      ...positionsState,
      strategyRegistered: true,
      positions: OFFICIAL_STABLE_CLUB_BASE_POOLS.map((pool, legIndex) => ({
        legIndex,
        poolId: pool.poolIdHash,
        poolLabel: pool.label,
        positionTokenId: BigInt(1000 + legIndex),
        amountA: BigInt(1_000_000),
        amountB: BigInt(0),
        tokenA: pool.tokenA.address,
        tokenB: pool.tokenB.address,
        tokenASymbol: pool.tokenA.symbol,
        tokenBSymbol: pool.tokenB.symbol,
        allocationBps: BigInt(2000),
        liquidity: BigInt(1),
        rangeStatus: "in-range",
        protocol: pool.protocol,
        npm: pool.infrastructure.npm,
        adapter: pool.infrastructure.npm,
        nftContract: pool.infrastructure.npm,
      })),
    };
    render(<StableClubBetaView />);

    // With live positions, My Position opens so the five-LP table is visible immediately
    expect(screen.getByRole("heading", { name: "My Position" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "My Position" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    expect(screen.getByRole("button", { name: "Add Funds" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Harvest" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compound" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Withdraw" })).toBeInTheDocument();
    expect(screen.queryByText(/Coming Soon/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Harvest All/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Withdraw All/i })).toBeNull();

    // Full five-pool LP table always present
    expect(screen.getByRole("columnheader", { name: "Pool" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Alloc" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "APY" })).toBeInTheDocument();
    expect(screen.getAllByText("20%").length).toBeGreaterThanOrEqual(5);

    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));
    expect(screen.getByRole("dialog", { name: "Confirm Withdraw" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "100%" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Custom %" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getByRole("tab", { name: "Available Pools" }));
    expect(screen.getByRole("heading", { name: "TOP BASE CHAIN LPs" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "My Position" }));
    expect(screen.getByRole("heading", { name: "My Position" })).toBeInTheDocument();
  });
});
