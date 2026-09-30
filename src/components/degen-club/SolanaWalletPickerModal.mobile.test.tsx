/**
 * Mobile Connect Wallet: when Phantom is not injected, offer Open in Phantom
 * (browse deep link) instead of only "Install Phantom".
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, act } from "@testing-library/react";

vi.mock("@/lib/degen-solana/injected-wallets", () => ({
  listSolanaInjectedWallets: () => [],
  waitForSolanaWallets: async () => [],
}));

import { SolanaWalletPickerModal } from "@/components/degen-club/SolanaWalletPickerModal";

const PRODUCT =
  "https://app.indexla.tech/app/degen-club/product/solana-memecoin-index";

describe("SolanaWalletPickerModal mobile handoff", () => {
  const originalUa = navigator.userAgent;

  beforeEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { href: PRODUCT },
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: originalUa,
    });
    cleanup();
  });

  it("on mobile Safari without inject: shows Open in Phantom with product URL", async () => {
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

    const handoff = await screen.findByTestId("phantom-mobile-handoff");
    expect(handoff).toBeTruthy();
    const link = screen.getByTestId("open-in-phantom") as HTMLAnchorElement;
    expect(link.textContent).toMatch(/Open in Phantom/i);
    expect(link.getAttribute("href")).toContain("phantom.app/ul/browse/");
    expect(link.getAttribute("href")).toContain(encodeURIComponent(PRODUCT));
    expect(screen.queryByText("Install Phantom")).toBeNull();
    // Label stays Connect Wallet on the dialog
    expect(screen.getByRole("dialog", { name: "Connect Wallet" })).toBeTruthy();
  });

  it("on Android without inject: uses intent:// handoff", async () => {
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

    const link = (await screen.findByTestId(
      "open-in-phantom",
    )) as HTMLAnchorElement;
    expect(link.getAttribute("href")?.startsWith("intent://ul/browse/")).toBe(
      true,
    );
    expect(link.getAttribute("href")).toContain("package=app.phantom");
  });

  it("inside Phantom in-app browser with no inject yet: retry, not download-first", async () => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Phantom/25.0.0",
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

    await waitFor(() => {
      expect(screen.queryByTestId("open-in-phantom")).toBeNull();
    });
    expect(await screen.findByTestId("phantom-inapp-retry")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});
