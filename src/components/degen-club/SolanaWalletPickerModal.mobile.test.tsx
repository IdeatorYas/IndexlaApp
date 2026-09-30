/**
 * Connect Wallet → Phantom option always listed → select connects or launches handoff.
 * No separate "Open in Phantom" pre-step.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, act, fireEvent } from "@testing-library/react";

vi.mock("@/lib/degen-solana/injected-wallets", () => ({
  listSolanaInjectedWallets: () => [],
  waitForSolanaWallets: async () => [],
}));

import { SolanaWalletPickerModal } from "@/components/degen-club/SolanaWalletPickerModal";
import * as phantomMobile from "@/lib/degen-solana/phantom-mobile";

const PRODUCT =
  "https://app.indexla.tech/app/degen-club/product/solana-memecoin-index";

describe("SolanaWalletPickerModal simplified connect", () => {
  const originalUa = navigator.userAgent;
  let assignedHref = "";

  beforeEach(() => {
    assignedHref = "";
    vi.spyOn(phantomMobile, "launchPhantomHandoff").mockImplementation((url) => {
      assignedHref = phantomMobile.buildPhantomOpenInAppHref(url ?? PRODUCT);
    });
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        href: PRODUCT,
        assign: (u: string) => {
          assignedHref = u;
        },
      },
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: originalUa,
    });
    vi.restoreAllMocks();
    cleanup();
  });

  it("always shows Phantom — no Open in Phantom pre-step", async () => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
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

    expect(
      await screen.findByTestId("solana-wallet-option-phantom"),
    ).toBeTruthy();
    expect(screen.queryByTestId("open-in-phantom")).toBeNull();
    expect(screen.queryByText("Open in Phantom")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Connect Wallet" })).toBeTruthy();
  });

  it("selecting Phantom on mobile without inject launches handoff", async () => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
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

    fireEvent.click(await screen.findByTestId("solana-wallet-option-phantom"));
    await waitFor(() => {
      expect(assignedHref.startsWith("https://phantom.app/ul/browse/")).toBe(
        true,
      );
    });
    expect(assignedHref).toContain("ixl_phantom");
  });
});
