/**
 * Verifies Connect Wallet click opens the Solana picker (no silent no-op).
 * Run: npx vitest run src/components/shell/AppHeader.wallet-click.test.tsx
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/degen-club/product/solana-memecoin-index",
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock("@/components/theme/ThemeProvider", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));

vi.mock("@/lib/feature-flags", () => ({
  getClientFeatureFlags: () => ({ DEXLA_DEMO_MODE: false }),
}));

vi.mock("@/lib/data", () => ({
  getDexlaBalance: () => ({
    data: { balance: 0, discountPercent: 0 },
  }),
}));

vi.mock("@/components/wallet/DemoWalletProvider", () => ({
  useDemoWallet: () => ({
    wallet: {
      state: "disconnected",
      address: null,
      shortenedAddress: null,
      networkId: null,
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
    ethBalanceFormatted: null,
  }),
}));

const connectMock = vi.fn(async () => "So11111111111111111111111111111111111111112");

vi.mock("@/components/degen-club/SolanaWalletProvider", () => ({
  useSolanaWallet: () => ({
    ready: true,
    connected: false,
    publicKey: null,
    connecting: false,
    error: null,
    listWallets: () => [
      {
        id: "phantom",
        name: "Phantom",
        provider: { connect: async () => ({ publicKey: { toString: () => "x" } }) },
      },
    ],
    discoverWallets: async () => [
      {
        id: "phantom",
        name: "Phantom",
        provider: { connect: async () => ({ publicKey: { toString: () => "x" } }) },
      },
    ],
    connect: connectMock,
    disconnect: vi.fn(),
    signAllTransactions: vi.fn(),
    signTransaction: vi.fn(),
    signAndSendTransaction: vi.fn(),
    connection: {},
  }),
}));

vi.mock("@/lib/degen-solana/injected-wallets", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/degen-solana/injected-wallets")
  >("@/lib/degen-solana/injected-wallets");
  return {
    ...actual,
    listSolanaInjectedWallets: () => [
      {
        id: "phantom",
        name: "Phantom",
        provider: { connect: async () => ({ publicKey: { toString: () => "x" } }) },
      },
    ],
    waitForSolanaWallets: async () => [
      {
        id: "phantom",
        name: "Phantom",
        provider: { connect: async () => ({ publicKey: { toString: () => "x" } }) },
      },
    ],
  };
});

import { AppHeader } from "@/components/shell/AppHeader";

describe("AppHeader Solana Connect Wallet click", () => {
  beforeEach(() => {
    connectMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("opens wallet picker on Connect Wallet click (does not silently no-op)", async () => {
    render(<AppHeader />);
    const btn = screen.getByRole("button", { name: "Connect Wallet" });
    fireEvent.click(btn);
    expect(await screen.findByTestId("solana-wallet-picker")).toBeTruthy();
    expect(await screen.findByTestId("solana-wallet-option-phantom")).toBeTruthy();
  });

  it("picking Phantom calls connect and closes picker on success", async () => {
    render(<AppHeader />);
    fireEvent.click(screen.getByRole("button", { name: "Connect Wallet" }));
    const option = await screen.findByTestId("solana-wallet-option-phantom");
    fireEvent.click(option);
    await waitFor(() => expect(connectMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.queryByTestId("solana-wallet-picker")).toBeNull(),
    );
  });
});
