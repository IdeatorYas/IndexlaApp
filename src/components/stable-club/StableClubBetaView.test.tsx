import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { StableClubBetaView } from "@/components/stable-club/StableClubBetaView";
import { OFFICIAL_STABLE_CLUB_BASE_POOLS } from "@/lib/stable-club/official-pools";
import {
  STABLE_CLUB_DEMO_POOL_COUNT,
  STABLE_CLUB_DEMO_PRODUCTS,
} from "@/lib/stable-club/demo-strategies";

vi.mock("@/components/stable-club/useStableClubBetaReadiness", () => ({
  useStableClubBetaReadiness: () => ({
    readiness: {
      depositsEnabled: false,
      depositBlockers: [
        "Deployment attestation has not passed",
        "Pool not governance-activated on-chain: USDC-cbBTC-AERO-CL100",
      ],
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
    amountInput: "1000",
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

vi.mock("@/components/stable-club/useStableClubPoolApy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/stable-club/useStableClubPoolApy")>();
  return {
    ...actual,
    useStableClubPoolApyMap: () => ({ byPoolId: {}, loading: false }),
  };
});

vi.mock("@/components/stable-club/useStableClubHarvest", () => ({
  useStableClubHarvest: () => ({
    deployments: null,
    permissionRegistered: false,
    registerHarvestPermission: vi.fn(),
    runHarvest: vi.fn(),
    busy: false,
    uiStatus: { status: "idle", message: null, lastTxHash: null, lastValidationCode: null },
    verifiedAdapters: [],
  }),
}));

vi.mock("@/components/stable-club/useStableClubCompound", () => ({
  useStableClubCompound: () => ({
    deployments: null,
    permissionRegistered: false,
    registerCompoundPermission: vi.fn(),
    runCompound: vi.fn(),
    busy: false,
    uiStatus: { status: "idle", message: null, lastTxHash: null, lastValidationCode: null },
    automationAvailable: false,
    automationStatusMessage: "OpenServ compound keeper is not connected",
    verifiedAdapters: [],
  }),
}));

vi.mock("@/components/stable-club/useFivePoolPositions", () => ({
  useFivePoolPositions: () => ({
    deploymentsLoading: false,
    deployments: { network: "base", chainId: 8453 },
    deploymentsError: null,
    onExpectedChain: true,
    expectedChainId: 8453,
    strategyId: null,
    strategyRegistered: false,
    strategyRevoked: false,
    strategyExpired: false,
    positions: [],
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
    refreshPositions: vi.fn(),
    exitIndividual: vi.fn(),
    exitAll: vi.fn(),
    emergencyExitLeg: vi.fn(),
    emergencyExitAllSequential: vi.fn(),
    revokeStrategy: vi.fn(),
    showDirectExitPlan: vi.fn(),
  }),
}));

describe("StableClubBetaView", () => {
  afterEach(() => cleanup());

  it("renders hero, live Base strategy first, demos, and category copy", () => {
    render(<StableClubBetaView />);

    expect(screen.getByText("INDEXLA STABLE CLUB")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "One Deposit. Five Pools. Less Risk." })).toBeInTheDocument();
    expect(screen.getByText(/automatically harvests and compounds/i)).toBeInTheDocument();
    expect(screen.getByText(/20% Per Pool · Auto-Harvest · Auto-Compound · Non-Custodial/i)).toBeInTheDocument();

    const strategyBoxes = document.querySelectorAll("[data-strategy]");
    expect(strategyBoxes[0]).toHaveAttribute("data-strategy", "base-five-pool");
    expect(strategyBoxes[0]).toHaveAttribute("data-status", "live-beta");
    expect(screen.getByText("LIVE BETA · BASE")).toBeInTheDocument();
    expect(screen.getByText(/Your five-pool positions/i)).toBeInTheDocument();

    for (const pool of OFFICIAL_STABLE_CLUB_BASE_POOLS) {
      expect(screen.getByText(pool.id)).toBeInTheDocument();
    }
    expect(screen.getAllByText("20%").length).toBeGreaterThanOrEqual(5);
    expect(screen.getByText("Total allocation")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();

    // Assets and platforms are separate columns
    expect(screen.getAllByText("Asset pair").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Platform").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Uniswap V3").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Aerodrome").length).toBeGreaterThanOrEqual(3);

    expect(screen.getAllByText("UPCOMING · DEMO ONLY · NOT ACTIVE")).toHaveLength(
      STABLE_CLUB_DEMO_PRODUCTS.length,
    );
    expect(screen.getAllByText("Stable → Stable").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Stable → ETH/BTC").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Bitcoin → Other Blue Chips").length).toBeGreaterThanOrEqual(1);

    let demoPoolCount = 0;
    for (const product of STABLE_CLUB_DEMO_PRODUCTS) {
      for (const pool of product.pools) {
        expect(screen.getAllByText(pool.pair).length).toBeGreaterThanOrEqual(1);
        demoPoolCount += 1;
      }
    }
    expect(demoPoolCount).toBe(STABLE_CLUB_DEMO_POOL_COUNT);
    expect(STABLE_CLUB_DEMO_POOL_COUNT).toBe(15);

    const comingSoon = screen.getAllByRole("button", { name: "Coming Soon" });
    expect(comingSoon).toHaveLength(3);
    for (const btn of comingSoon) {
      expect(btn).toBeDisabled();
    }

    expect(
      screen.getByRole("heading", { name: "Three Strategies. Built for Different Risk Levels." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/When these upcoming strategies are activated, INDEXLA will automatically harvest and compound/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/APYs are variable, may change rapidly and are not guaranteed/i)).toBeInTheDocument();

    // Technical attestation errors hidden from users
    expect(screen.queryByText("Deposit unavailable")).toBeNull();
    expect(screen.queryByText(/Deployment attestation has not passed/i)).toBeNull();
    expect(screen.queryByText(/Pool not governance-activated on-chain/i)).toBeNull();

    expect(screen.queryByText("FAQ")).toBeNull();
    expect(screen.getByText(/INDEXLA does not custody funds/)).toBeInTheDocument();

    expect(screen.getAllByText(/Auto-Harvest · Auto-Compound/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: /Opt in Auto-Harvest/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Opt in Auto-Compound/i })).toBeDisabled();

    const depositButtons = screen.getAllByRole("button", { name: "Deposit Into 5-Pool Strategy" });
    // Strategy box CTA stays clickable so users get feedback; hero CTA is an anchor.
    expect(depositButtons.length).toBeGreaterThanOrEqual(1);
    expect(depositButtons.every((b) => !(b as HTMLButtonElement).disabled)).toBe(true);
  });

  it("keeps auto-harvest and auto-compound in Base product messaging", () => {
    render(<StableClubBetaView />);
    const base = document.querySelector('[data-strategy="base-five-pool"]');
    expect(base).not.toBeNull();
    expect(within(base as HTMLElement).getByText(/Auto-Harvest/i)).toBeInTheDocument();
    expect(within(base as HTMLElement).getByText(/Auto-Compound/i)).toBeInTheDocument();
    expect(screen.queryByText(/Coming Soon.*Auto-Harvest/i)).toBeNull();
  });
});
