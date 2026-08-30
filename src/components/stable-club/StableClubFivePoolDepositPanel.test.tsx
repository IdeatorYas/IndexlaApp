import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { StableClubFivePoolDepositPanel } from "@/components/stable-club/StableClubFivePoolDepositPanel";

const prepareQuotes = vi.fn();
const submitDeposit = vi.fn();
const registerStrategy = vi.fn();

let mockState: Record<string, unknown>;

vi.mock("@/components/stable-club/useFivePoolDeposit", () => ({
  useFivePoolDeposit: () => mockState,
}));

describe("StableClubFivePoolDepositPanel", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    prepareQuotes.mockReset();
    submitDeposit.mockReset();
    registerStrategy.mockReset();
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
      prepareQuotes,
      submitDeposit,
      registerStrategy,
      invalidatePlan: vi.fn(),
      wallet: { address: "0xuser" },
    };
  });

  it("renders five pool preview rows and eight swaps", () => {
    render(<StableClubFivePoolDepositPanel />);
    expect(screen.getByText("Five-pool deposit")).toBeInTheDocument();
    expect(screen.getByText("USDC-cbBTC-AERO-CL100")).toBeInTheDocument();
    expect(screen.getByText("cbBTC-WETH-UNI-005")).toBeInTheDocument();
    expect(screen.getByText(/Eight swap legs/i)).toBeInTheDocument();
    expect(screen.getByText(/Non-custodial/i)).toBeInTheDocument();
    expect(screen.getByText(/revocable/i)).toBeInTheDocument();
  });

  it("wires prepare and deposit buttons", () => {
    render(<StableClubFivePoolDepositPanel />);
    fireEvent.click(screen.getByRole("button", { name: /^Prepare quotes$/i }));
    expect(prepareQuotes).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /^Deposit \(Permit2 → CL\)$/i }));
    expect(submitDeposit).toHaveBeenCalledTimes(1);
  });

  it("shows confirmed tx without Basescan on local chain", () => {
    mockState.progress = "confirmed";
    mockState.statusMessage = "Deposit confirmed";
    mockState.explorerUrl = null;
    mockState.expectedChainId = 31337;
    render(<StableClubFivePoolDepositPanel />);
    expect(screen.getByText(/4 · Confirmed/)).toBeInTheDocument();
    expect(screen.getByText(/Tx:\s*0xtxhash/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "0xtxhash" })).toBeNull();
  });

  it("keeps Basescan explorer links on Base chainId 8453", () => {
    mockState.progress = "confirmed";
    mockState.statusMessage = "Deposit confirmed";
    mockState.expectedChainId = 8453;
    mockState.explorerUrl = "https://basescan.org/tx/0xtxhash";
    render(<StableClubFivePoolDepositPanel />);
    const link = screen.getByRole("link", { name: "0xtxhash" });
    expect(link).toHaveAttribute("href", "https://basescan.org/tx/0xtxhash");
  });

  it("prevents deposit click when not plan-ready", () => {
    mockState.planReady = false;
    render(<StableClubFivePoolDepositPanel />);
    expect(screen.getByRole("button", { name: /^Deposit \(Permit2 → CL\)$/i })).toBeDisabled();
  });

  it("shows wallet rejection / failure text when error set", () => {
    mockState.progress = "failed";
    mockState.error = "Wallet rejected the request";
    render(<StableClubFivePoolDepositPanel />);
    expect(screen.getByText(/Wallet rejected the request/)).toBeInTheDocument();
    expect(screen.getByText(/5 · Failed/)).toBeInTheDocument();
  });
});
