import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { OFFICIAL_STABLE_CLUB_BASE_POOLS } from "@/lib/stable-club/official-pools";
import { StableClubFivePoolDepositPanel } from "@/components/stable-club/StableClubFivePoolDepositPanel";
import { readCurrentTicks } from "@/components/stable-club/useFivePoolDeposit";

const depositIntoFivePoolStrategy = vi.fn();

let mockState: Record<string, unknown>;
let mockWallet: {
  status: string;
  chainId: number | null;
  address: string | null;
  connect: ReturnType<typeof vi.fn>;
  switchToBase: ReturnType<typeof vi.fn>;
};

const useStableClubDevPanelAllowedMock = vi.fn((allowed: boolean) => allowed);

vi.mock("@/components/stable-club/useStableClubDevPanelAllowed", () => ({
  useStableClubDevPanelAllowed: (allowed: boolean) => useStableClubDevPanelAllowedMock(allowed),
}));

vi.mock("@/components/wallet/StableClubWalletProvider", () => ({
  useStableClubWallet: () => mockWallet,
}));

vi.mock("@/components/stable-club/useFivePoolDeposit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/stable-club/useFivePoolDeposit")>();
  return {
    ...actual,
    useFivePoolDeposit: () => mockState,
  };
});

describe("StableClubFivePoolDepositPanel", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    depositIntoFivePoolStrategy.mockReset();
    mockWallet = {
      status: "connected",
      chainId: 31337,
      address: "0xuser",
      connect: vi.fn(),
      switchToBase: vi.fn(),
    };
    useStableClubDevPanelAllowedMock.mockImplementation((allowed: boolean) => allowed);
    mockState = {
      deploymentsLoading: false,
      deployments: {
        clExecutor: "0xCL",
        network: "hardhat-local",
      },
      deploymentsError: null,
      amountInput: "1000",
      setAmountInput: vi.fn(),
      swapSlippageInput: "100",
      setSwapSlippageInput: vi.fn(),
      lpSlippageInput: "100",
      setLpSlippageInput: vi.fn(),
      usdcBalanceFormatted: "5000",
      strategyId: "0xstrat",
      strategyRegistered: true,
      executionNonce: BigInt(1),
      progress: "idle",
      preview: {
        feeLabel: "1% execution fee on each swap",
        swapSlippageBps: BigInt(100),
        lpSlippageBps: BigInt(100),
        deadline: BigInt(99),
        maxQuoteAgeSec: 90,
        quoteSource: "oracle-guard",
        pools: [
          {
            poolId: "USDC-cbBTC-AERO-CL100",
            allocationBps: 2000,
            allocationUsdc: BigInt(200_000_000),
            tokenASymbol: "USDC",
            tokenBSymbol: "cbBTC",
            desiredA: BigInt(100),
            desiredB: BigInt(200),
            amountAMin: BigInt(99),
            amountBMin: BigInt(198),
          },
          {
            poolId: "USDC-cbBTC-UNI-005",
            allocationBps: 2000,
            allocationUsdc: BigInt(200_000_000),
            tokenASymbol: "USDC",
            tokenBSymbol: "cbBTC",
            desiredA: BigInt(100),
            desiredB: BigInt(200),
            amountAMin: BigInt(99),
            amountBMin: BigInt(198),
          },
          {
            poolId: "cbBTC-WETH-AERO-CL10",
            allocationBps: 2000,
            allocationUsdc: BigInt(200_000_000),
            tokenASymbol: "cbBTC",
            tokenBSymbol: "WETH",
            desiredA: BigInt(1),
            desiredB: BigInt(2),
            amountAMin: BigInt(1),
            amountBMin: BigInt(1),
          },
          {
            poolId: "cbBTC-WETH-AERO-CL100",
            allocationBps: 2000,
            allocationUsdc: BigInt(200_000_000),
            tokenASymbol: "cbBTC",
            tokenBSymbol: "WETH",
            desiredA: BigInt(1),
            desiredB: BigInt(2),
            amountAMin: BigInt(1),
            amountBMin: BigInt(1),
          },
          {
            poolId: "cbBTC-WETH-UNI-005",
            allocationBps: 2000,
            allocationUsdc: BigInt(200_000_000),
            tokenASymbol: "cbBTC",
            tokenBSymbol: "WETH",
            desiredA: BigInt(1),
            desiredB: BigInt(2),
            amountAMin: BigInt(1),
            amountBMin: BigInt(1),
          },
        ],
        swaps: Array.from({ length: 8 }, (_, i) => ({
          slotId: `slot-${i}`,
          routeKey: "USDC_CBBTC_UNI",
          tokenOutSymbol: "cbBTC",
          grossUsdcIn: BigInt(100_000_000),
          netUsdcIn: BigInt(99_000_000),
          quotedOut: BigInt(50),
          minOut: BigInt(49),
        })),
        messaging: {
          nonCustodial: "Non-custodial: test",
          revocable: "Permissions are revocable: test",
        },
      },
      planReady: true,
      statusMessage: null,
      error: null,
      lastTxHash: "0xtxhash",
      approvalTxHashes: [],
      explorerUrl: null,
      onExpectedChain: true,
      expectedChainId: 31337,
      busy: false,
      depositIntoFivePoolStrategy,
      prepareQuotes: vi.fn(),
      submitDeposit: vi.fn(),
      registerStrategy: vi.fn(),
      invalidatePlan: vi.fn(),
      wallet: { address: "0xuser" },
    };
  });

  it("renders five pool preview rows and eight swaps in dev variant", () => {
    render(<StableClubFivePoolDepositPanel variant="dev" devPanelAllowed />);
    expect(screen.getByText("Five-pool deposit")).toBeInTheDocument();
    expect(screen.getByText("USDC-cbBTC-AERO-CL100")).toBeInTheDocument();
    expect(screen.getByText("cbBTC-WETH-UNI-005")).toBeInTheDocument();
    expect(screen.getByText(/Eight swap legs/i)).toBeInTheDocument();
    expect(screen.getByText(/Non-custodial/i)).toBeInTheDocument();
    expect(screen.getByText(/revocable/i)).toBeInTheDocument();
  });

  it("wires dev prepare and deposit buttons", () => {
    const prepareQuotes = vi.fn();
    const submitDeposit = vi.fn();
    mockState.prepareQuotes = prepareQuotes;
    mockState.submitDeposit = submitDeposit;
    render(<StableClubFivePoolDepositPanel variant="dev" devPanelAllowed />);
    fireEvent.click(screen.getByRole("button", { name: /^Prepare quotes$/i }));
    expect(prepareQuotes).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /Deposit Into 5-Pool Strategy/i }));
    expect(submitDeposit).toHaveBeenCalledTimes(1);
  });

  it("product variant exposes single primary deposit button only", () => {
    mockWallet.chainId = 8453;
    mockState.expectedChainId = 8453;
    mockState.onExpectedChain = true;
    render(<StableClubFivePoolDepositPanel variant="product" />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Deposit Into 5-Pool Strategy/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Deposit Into 5-Pool Strategy/i }));
    expect(depositIntoFivePoolStrategy).toHaveBeenCalledTimes(1);
  });

  it("product variant shows Base network status, never a local chain id", () => {
    render(<StableClubFivePoolDepositPanel variant="product" />);
    expect(screen.getByText("Not on Base")).toBeInTheDocument();
    expect(screen.getByText("Wrong network — switch wallet to Base.")).toBeInTheDocument();
    expect(screen.queryByText(/Need chain 31337/)).toBeNull();
    expect(screen.queryByText(/switch wallet to chain 31337/)).toBeNull();
  });

  it("product variant lists five canonical pool IDs at 20% with 100% total", () => {
    render(<StableClubFivePoolDepositPanel variant="product" />);
    for (const pool of OFFICIAL_STABLE_CLUB_BASE_POOLS) {
      expect(screen.getByText(pool.id)).toBeInTheDocument();
    }
    expect(screen.getByText("USDC/cbBTC · Aerodrome Slipstream")).toBeInTheDocument();
    expect(screen.getByText("USDC/cbBTC · Uniswap V3")).toBeInTheDocument();
    expect(screen.getAllByText("cbBTC/WETH · Aerodrome Slipstream")).toHaveLength(2);
    expect(screen.getByText("cbBTC/WETH · Uniswap V3")).toBeInTheDocument();
    expect(screen.getAllByText("20%")).toHaveLength(5);
    expect(screen.getByText("Total allocation")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /FAQ/i })).toBeNull();
  });

  it("product variant does not submit when deposits are disabled", () => {
    render(
      <StableClubFivePoolDepositPanel
        variant="product"
        depositsEnabled={false}
        depositBlockers={["no trusted production manifest"]}
      />,
    );
    const button = screen.getByRole("button", { name: /Deposit Into 5-Pool Strategy/i });
    expect(button).toBeDisabled();
    expect(screen.getByText("Deposit unavailable")).toBeInTheDocument();
    expect(screen.getByText("no trusted production manifest")).toBeInTheDocument();
    fireEvent.click(button);
    expect(depositIntoFivePoolStrategy).not.toHaveBeenCalled();
  });

  it("shows confirmed tx without Basescan on local chain", () => {
    mockState.progress = "confirmed";
    mockState.statusMessage = "Deposit confirmed";
    mockState.explorerUrl = null;
    mockState.expectedChainId = 31337;
    render(<StableClubFivePoolDepositPanel variant="dev" devPanelAllowed />);
    expect(screen.getByText(/4 · Confirmed/)).toBeInTheDocument();
    expect(screen.getByText(/Tx:\s*0xtxhash/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "0xtxhash" })).toBeNull();
  });

  it("keeps Basescan explorer links on Base chainId 8453", () => {
    mockState.progress = "confirmed";
    mockState.statusMessage = "Deposit confirmed";
    mockState.expectedChainId = 8453;
    mockState.explorerUrl = "https://basescan.org/tx/0xtxhash";
    render(<StableClubFivePoolDepositPanel variant="dev" devPanelAllowed />);
    const link = screen.getByRole("link", { name: "0xtxhash" });
    expect(link).toHaveAttribute("href", "https://basescan.org/tx/0xtxhash");
  });

  it("prevents deposit click when not plan-ready", () => {
    mockState.planReady = false;
    render(<StableClubFivePoolDepositPanel variant="dev" devPanelAllowed />);
    expect(screen.getByRole("button", { name: /Deposit Into 5-Pool Strategy/i })).toBeDisabled();
  });

  it("shows wallet rejection / failure text when error set", () => {
    mockState.progress = "failed";
    mockState.error = "Wallet rejected the request";
    render(<StableClubFivePoolDepositPanel variant="dev" devPanelAllowed />);
    expect(screen.getByText(/Wallet rejected the request/)).toBeInTheDocument();
    expect(screen.getByText(/5 · Failed/)).toBeInTheDocument();
  });

  it("renders nothing for dev variant when devPanelAllowed is false", () => {
    const { container } = render(
      <StableClubFivePoolDepositPanel variant="dev" devPanelAllowed={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("dev panel access — denied on production/Base", () => {
  afterEach(() => {
    cleanup();
  });

  it("hides dev variant when wallet hook denies Base chain 8453", () => {
    useStableClubDevPanelAllowedMock.mockReturnValue(false);
    const { container } = render(<StableClubFivePoolDepositPanel variant="dev" devPanelAllowed />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("SC-F03 — never substitute tick zero on RPC failure", () => {
  const poolsWithAddress = OFFICIAL_STABLE_CLUB_BASE_POOLS.filter((p) => p.poolAddress);

  beforeEach(() => {
    useStableClubDevPanelAllowedMock.mockImplementation((allowed: boolean) => allowed);
  });

  function mockClient(readImpl: (address: string) => Promise<readonly unknown[]>) {
    return {
      readContract: vi.fn(async (args: { address: string }) => readImpl(args.address)),
    };
  }

  it("successful non-zero tick remains unchanged", async () => {
    const client = mockClient(async () => [BigInt(0), 1234, 0, 1, 1, false] as const);
    const ticks = await readCurrentTicks(client, "base", 8453);
    expect(ticks).toHaveLength(poolsWithAddress.length);
    expect(ticks.every((t) => t === 1234)).toBe(true);
    expect(client.readContract).toHaveBeenCalledTimes(poolsWithAddress.length);
  });

  it("successful tick exactly 0 is accepted", async () => {
    const client = mockClient(async () => [BigInt(0), 0, 0, 1, 1, false] as const);
    const ticks = await readCurrentTicks(client, "base", 8453);
    expect(ticks).toEqual(poolsWithAddress.map(() => 0));
  });

  it("one pool RPC rejection makes readCurrentTicks fail", async () => {
    const failing = poolsWithAddress[2]!;
    const client = mockClient(async (address) => {
      if (address.toLowerCase() === failing.poolAddress!.toLowerCase()) {
        throw new Error("RPC timeout");
      }
      return [BigInt(0), 99, 0, 1, 1, false] as const;
    });
    await expect(readCurrentTicks(client, "base", 8453)).rejects.toThrow(
      new RegExp(`Failed to read current tick for pool ${failing.id}`),
    );
    await expect(readCurrentTicks(client, "base", 8453)).rejects.toThrow(/RPC timeout/);
  });

  it("failure does not return other pools’ partial ticks", async () => {
    const failing = poolsWithAddress[1]!;
    let calls = 0;
    const client = mockClient(async (address) => {
      calls += 1;
      if (address.toLowerCase() === failing.poolAddress!.toLowerCase()) {
        throw new Error("slot0 reverted");
      }
      return [BigInt(0), 50, 0, 1, 1, false] as const;
    });
    await expect(readCurrentTicks(client, "base", 8453)).rejects.toThrow(/slot0 reverted/);
    expect(calls).toBeLessThanOrEqual(poolsWithAddress.length);
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it("deposit preparation/submission does not continue after tick failure", async () => {
    const buildPlan = vi.fn();
    const submitDepositLocal = vi.fn();
    const client = mockClient(async () => {
      throw new Error("network down");
    });

    let ticks: number[] | undefined;
    let prepareError: string | null = null;
    let planReady = false;
    let progress: "idle" | "preparing-quotes" | "failed" = "preparing-quotes";

    try {
      ticks = await readCurrentTicks(client, "base", 8453);
      buildPlan(ticks);
      planReady = true;
      progress = "idle";
    } catch (err) {
      progress = "failed";
      prepareError = err instanceof Error ? err.message : "Quote preparation failed";
      planReady = false;
      ticks = undefined;
    }

    expect(ticks).toBeUndefined();
    expect(buildPlan).not.toHaveBeenCalled();
    expect(planReady).toBe(false);
    expect(progress).toBe("failed");
    expect(prepareError).toMatch(/Failed to read current tick/);
    if (planReady) submitDepositLocal();
    expect(submitDepositLocal).not.toHaveBeenCalled();
  });

  it("user-facing state reports failure instead of presenting a valid plan", () => {
    mockState.progress = "failed";
    mockState.planReady = false;
    mockState.preview = null;
    mockState.error =
      "Failed to read current tick for pool USDC-cbBTC-UNI-005 (0xPool): RPC timeout";
    render(<StableClubFivePoolDepositPanel variant="dev" devPanelAllowed />);
    expect(screen.getByText(/5 · Failed/)).toBeInTheDocument();
    expect(
      screen.getByText(/Failed to read current tick for pool USDC-cbBTC-UNI-005/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Deposit Into 5-Pool Strategy/i })).toBeDisabled();
    expect(screen.queryByText(/Quotes ready/i)).toBeNull();
  });

  it("hardhat-local + 31337 + missing poolAddress → intentional tick 0 allowed", async () => {
    const client = mockClient(async () => {
      throw new Error("should not RPC on verified local");
    });
    const ticks = await readCurrentTicks(client, "hardhat-local", 31337, [
      { id: "LOCAL-MISSING-ADDR", poolAddress: null },
    ]);
    expect(ticks).toEqual([0]);
    expect(client.readContract).not.toHaveBeenCalled();
  });

  it("Base 8453 + missing poolAddress → fail closed", async () => {
    const client = mockClient(async () => [BigInt(0), 1, 0, 1, 1, false] as const);
    await expect(
      readCurrentTicks(client, "base", 8453, [{ id: "BASE-MISSING-ADDR", poolAddress: null }]),
    ).rejects.toThrow(/Missing or invalid poolAddress for live tick read on pool BASE-MISSING-ADDR/);
    expect(client.readContract).not.toHaveBeenCalled();
  });

  it("Base 8453 + invalid poolAddress → fail closed", async () => {
    const client = mockClient(async () => [BigInt(0), 1, 0, 1, 1, false] as const);
    await expect(
      readCurrentTicks(client, "base", 8453, [
        {
          id: "BASE-ZERO-ADDR",
          poolAddress: "0x0000000000000000000000000000000000000000",
        },
      ]),
    ).rejects.toThrow(/Missing or invalid poolAddress for live tick read on pool BASE-ZERO-ADDR/);
    expect(client.readContract).not.toHaveBeenCalled();
  });

  it("Base failure produces no plan/deposit call", async () => {
    const buildPlan = vi.fn();
    const submitDepositLocal = vi.fn();
    const client = mockClient(async () => [BigInt(0), 1, 0, 1, 1, false] as const);

    let planReady = false;
    try {
      const ticks = await readCurrentTicks(client, "base", 8453, [
        { id: "BASE-MISSING-ADDR", poolAddress: null },
      ]);
      buildPlan(ticks);
      planReady = true;
    } catch {
      planReady = false;
    }

    expect(planReady).toBe(false);
    expect(buildPlan).not.toHaveBeenCalled();
    if (planReady) submitDepositLocal();
    expect(submitDepositLocal).not.toHaveBeenCalled();
  });
});
