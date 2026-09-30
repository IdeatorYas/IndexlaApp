/**
 * Mobile Connect Wallet: without inject → Open in Phantom (UL, no download Intent).
 * Status line always visible so failures are reportable.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, act, fireEvent } from "@testing-library/react";

vi.mock("@/lib/degen-solana/injected-wallets", () => ({
  listSolanaInjectedWallets: () => [],
  waitForSolanaWallets: async () => [],
}));

import { SolanaWalletPickerModal } from "@/components/degen-club/SolanaWalletPickerModal";

const PRODUCT =
  "https://app.indexla.tech/app/degen-club/product/solana-memecoin-index";

describe("SolanaWalletPickerModal mobile handoff", () => {
  const originalUa = navigator.userAgent;
  let assignedHref = "";

  beforeEach(() => {
    assignedHref = "";
    const loc = {
      href: PRODUCT,
      assign(url: string) {
        assignedHref = url;
      },
    };
    Object.defineProperty(window, "location", {
      configurable: true,
      value: loc,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: originalUa,
    });
    cleanup();
  });

  it("on mobile without inject: Open in Phantom uses browse UL (not Intent download)", async () => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    });

    await act(async () => {
      render(
        <SolanaWalletPickerModal
          open
          onClose={() => undefined}
          onPick={() => undefined}
        />,
      );
    });

    expect(await screen.findByTestId("phantom-mobile-handoff")).toBeTruthy();
    expect(await screen.findByTestId("wallet-connect-status")).toBeTruthy();
    const btn = screen.getByTestId("open-in-phantom");
    fireEvent.click(btn);
    await waitFor(() => {
      expect(assignedHref.startsWith("https://phantom.app/ul/browse/")).toBe(
        true,
      );
    });
    expect(assignedHref).toContain("ixl_phantom");
    expect(assignedHref.startsWith("intent://")).toBe(false);
    expect(screen.queryByText("Install Phantom")).toBeNull();
  });

  it("on Android without inject: still uses https browse UL (no Intent fallback)", async () => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36",
    });

    await act(async () => {
      render(
        <SolanaWalletPickerModal
          open
          onClose={() => undefined}
          onPick={() => undefined}
        />,
      );
    });

    fireEvent.click(await screen.findByTestId("open-in-phantom"));
    await waitFor(() => {
      expect(assignedHref.startsWith("https://phantom.app/ul/browse/")).toBe(
        true,
      );
    });
    expect(assignedHref).not.toContain("browser_fallback_url");
  });
});
