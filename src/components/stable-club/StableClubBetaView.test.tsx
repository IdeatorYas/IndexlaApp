import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { StableClubBetaView } from "@/components/stable-club/StableClubBetaView";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

const connect = vi.fn();
const exitAll = vi.fn();
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
  deployments: { network: "base" as const, chainId: 8453 },
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
  emergencyExitLeg: vi.fn(),
  emergencyExitAllSequential: vi.fn(),
  revokeStrategy: vi.fn(),
  showDirectExitPlan: vi.fn(),
};

vi.mock("@/components/stable-club/useStableClubBetaReadiness", () => ({
  useStableClubBetaReadiness: () => ({
    readiness: {
      depositsEnabled: true,
      depositBlockers: [],
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
    deployments: { network: "base", chainId: 8453 },
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
    useStableClubPoolApyMap: () => ({ byPoolId: {}, loading: false }),
  };
});

vi.mock("@/components/stable-club/useFivePoolPositions", () => ({
  useFivePoolPositions: () => positionsState,
}));

describe("StableClubBetaView", () => {
  afterEach(() => {
    cleanup();
    connect.mockReset();
    exitAll.mockReset();
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
    expect(screen.queryByText(/One Deposit\. Five Pools/i)).toBeNull();
    expect(screen.queryByText(/UPCOMING/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Connect Wallet" }));
    expect(connect).toHaveBeenCalled();
  });

  it("connected with no positions: shows compact deposit only", () => {
    walletState = {
      status: "connected",
      chainId: 8453,
      address: "0xab4e242C5b489e8301408C93003903364214559F",
      error: null,
      connect,
      switchToBase: vi.fn(),
    };
    render(<StableClubBetaView />);
    expect(screen.getByRole("heading", { name: "Deposit USDC" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deposit" })).toBeInTheDocument();
    expect(screen.queryByText("My Stable Club Position")).toBeNull();
    expect(screen.queryByText(/Opt in Auto-Harvest/i)).toBeNull();
    expect(screen.queryByText(/Three Strategies/i)).toBeNull();
  });

  it("connected with positions: shows one table and three strategy buttons", () => {
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
      positions: [0, 1, 2, 3, 4].map((legIndex) => ({
        legIndex,
        poolId: `0x${String(legIndex + 1).padStart(64, "0")}` as `0x${string}`,
        poolLabel: `Pool ${legIndex + 1}`,
        positionTokenId: BigInt(1000 + legIndex),
        amountA: BigInt(1_000_000),
        amountB: BigInt(0),
        tokenASymbol: "USDC",
        tokenBSymbol: "WETH",
        allocationBps: BigInt(2000),
        liquidity: BigInt(1),
        rangeStatus: "in-range",
      })),
    };
    render(<StableClubBetaView />);

    expect(screen.getByRole("heading", { name: "My Stable Club Position" })).toBeInTheDocument();
    expect(screen.getByText("Pool 1")).toBeInTheDocument();
    expect(screen.getByText("Pool 5")).toBeInTheDocument();
    expect(screen.getAllByText("20%")).toHaveLength(5);

    const harvest = screen.getByRole("button", { name: "Harvest All" });
    const compound = screen.getByRole("button", { name: "Compound All" });
    const withdraw = screen.getByRole("button", { name: "Withdraw All" });
    expect(harvest).toBeDisabled();
    expect(compound).toBeDisabled();
    expect(withdraw).not.toBeDisabled();
    expect(screen.getAllByRole("tooltip", { hidden: true }).length).toBeGreaterThanOrEqual(2);

    fireEvent.click(withdraw);
    expect(exitAll).toHaveBeenCalled();

    expect(screen.queryByText(/Deposit Into 5-Pool/i)).toBeNull();
    expect(screen.queryByText(/automation/i)).toBeNull();
    expect(screen.queryByText(/UPCOMING/i)).toBeNull();
  });
});
