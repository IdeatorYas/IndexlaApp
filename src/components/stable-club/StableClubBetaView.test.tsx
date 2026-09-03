import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StableClubBetaView } from "@/components/stable-club/StableClubBetaView";

vi.mock("@/components/stable-club/useStableClubBetaReadiness", () => ({
  useStableClubBetaReadiness: () => ({
    readiness: {
      depositsEnabled: false,
      depositBlockers: ["no trusted production manifest"],
      globalStatus: "Ready for activation",
    },
    loading: false,
    error: null,
    isLocalHardhat: false,
  }),
}));

vi.mock("@/components/stable-club/useFivePoolDeposit", () => ({
  useFivePoolDeposit: () => ({
    deploymentsLoading: false,
    deployments: null,
    deploymentsError: null,
    amountInput: "",
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
    wallet: { address: null, chainId: null },
  }),
}));

vi.mock("@/components/wallet/StableClubWalletProvider", () => ({
  useStableClubWallet: () => ({
    status: "disconnected",
    chainId: null,
    address: null,
    connect: vi.fn(),
    switchToBase: vi.fn(),
  }),
}));

vi.mock("@/components/stable-club/useStableClubDevPanelAllowed", () => ({
  useStableClubDevPanelAllowed: () => false,
}));

describe("StableClubBetaView", () => {
  afterEach(() => cleanup());

  it("renders one strategy composition without extra marketing sections", () => {
    render(<StableClubBetaView />);
    expect(screen.getByText("Stable Club")).toBeInTheDocument();
    expect(screen.getByText("One Deposit. Five Liquidity Pools.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deposit Into 5-Pool Strategy" })).toBeDisabled();
    expect(screen.queryByText("FAQ")).toBeNull();
    expect(screen.queryByText("Pool risks & explanations")).toBeNull();
    expect(screen.queryByText("Strategy components (20% each)")).toBeNull();
    expect(screen.queryByText(/Est. blended strategy APY/)).toBeNull();
    expect(screen.queryByText("Your positions")).toBeNull();
    expect(screen.getByText(/INDEXLA does not custody funds/)).toBeInTheDocument();
    expect(screen.getByText("Base required")).toBeInTheDocument();
    expect(screen.queryByText(/Need chain 31337/)).toBeNull();
    expect(screen.getByRole("button", { name: "Deposit Into 5-Pool Strategy" }).closest("section")).toHaveClass(
      "stable-club-strategy-box",
    );
  });
});
