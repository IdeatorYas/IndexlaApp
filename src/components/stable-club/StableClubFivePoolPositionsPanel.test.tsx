import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { StableClubFivePoolPositionsPanel } from "@/components/stable-club/StableClubFivePoolPositionsPanel";

const exitIndividual = vi.fn();
const exitAll = vi.fn();
const emergencyExitLeg = vi.fn();
const emergencyExitAllSequential = vi.fn();
const refreshPositions = vi.fn();
const showDirectExitPlan = vi.fn();
const revokeStrategy = vi.fn();

let mockState: Record<string, unknown>;

vi.mock("@/components/stable-club/useFivePoolPositions", () => ({
  useFivePoolPositions: () => mockState,
}));

describe("StableClubFivePoolPositionsPanel", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    exitIndividual.mockReset();
    exitAll.mockReset();
    emergencyExitLeg.mockReset();
    emergencyExitAllSequential.mockReset();
    refreshPositions.mockReset();
    showDirectExitPlan.mockReset();
    revokeStrategy.mockReset();
    mockState = {
      deploymentsLoading: false,
      deployments: { network: "hardhat-local", chainId: 8453 },
      deploymentsError: null,
      onExpectedChain: true,
      expectedChainId: 8453,
      strategyId: "0xstrat",
      strategyRegistered: true,
      strategyRevoked: false,
      strategyExpired: false,
      positions: [
        {
          legIndex: 0,
          poolLabel: "USDC-cbBTC-AERO-CL100",
          pairLabel: "USDC/cbBTC",
          protocol: "aerodrome-slipstream",
          positionTokenId: BigInt(1),
          allocationBps: BigInt(2000),
          rangeStatus: "unknown",
          adapterApproved: false,
          amountA: BigInt(10),
          amountB: BigInt(20),
          liquidity: BigInt(30),
          nftContract: "0xadapter",
          explorerNftUrl: null,
          protocolExplorerHint: "Local mock NFT",
        },
      ],
      positionsLoading: false,
      positionsError: null,
      stale: false,
      progress: "idle",
      statusMessage: null,
      error: null,
      lastTxHash: null,
      explorerUrl: null,
      approvalTxHashes: [],
      legResults: [],
      directPlan: null,
      busy: false,
      refreshPositions,
      exitIndividual,
      exitAll,
      emergencyExitLeg,
      emergencyExitAllSequential,
      revokeStrategy,
      showDirectExitPlan,
    };
  });

  it("renders discovered position and exit controls", () => {
    render(<StableClubFivePoolPositionsPanel />);
    expect(screen.getByText(/Five-pool positions & exits/i)).toBeTruthy();
    expect(screen.getByText(/USDC-cbBTC-AERO-CL100/)).toBeTruthy();
    expect(screen.getByText(/Open positions/)).toBeTruthy();
    expect(screen.getByText("1 / 5")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Exit position$/i }));
    expect(exitIndividual).toHaveBeenCalledWith(0);
  });

  it("shows empty state", () => {
    mockState.positions = [];
    render(<StableClubFivePoolPositionsPanel />);
    expect(screen.getByText(/No open Stable Club NFTs/i)).toBeTruthy();
  });

  it("disables atomic Exit All when revoked", () => {
    mockState.strategyRevoked = true;
    render(<StableClubFivePoolPositionsPanel />);
    expect(screen.getByRole("button", { name: /Exit All \(atomic\)/i })).toBeDisabled();
    expect(screen.getByText(/Revoked — use emergency/i)).toBeTruthy();
  });
});
