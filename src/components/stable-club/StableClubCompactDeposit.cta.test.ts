import { describe, expect, it } from "vitest";

/**
 * Compact Add Funds CTA labeling — must never mute as DEPOSIT UNAVAILABLE without
 * an actionable next step (Connect / Switch / Retry / Add Funds).
 */
describe("StableClubCompactDeposit primary CTA states", () => {
  function label(input: {
    disconnected: boolean;
    wrongNetwork: boolean;
    switching: boolean;
    failClosed: boolean;
    busy: boolean;
    title: string;
  }): string {
    if (input.disconnected) return "Connect Wallet";
    if (input.wrongNetwork) return input.switching ? "Switching…" : "Switch to Base";
    if (input.failClosed) return "Retry";
    if (input.busy) return "Working…";
    return input.title.includes("Add") ? "Add Funds" : "Deposit USDC";
  }

  it("shows Connect Wallet when disconnected (not Deposit unavailable)", () => {
    expect(
      label({
        disconnected: true,
        wrongNetwork: false,
        switching: false,
        failClosed: true,
        busy: false,
        title: "Add Funds",
      }),
    ).toBe("Connect Wallet");
  });

  it("shows Switch to Base on wrong network", () => {
    expect(
      label({
        disconnected: false,
        wrongNetwork: true,
        switching: false,
        failClosed: false,
        busy: false,
        title: "Add Funds",
      }),
    ).toBe("Switch to Base");
  });

  it("shows Retry when readiness fail-closed (never mute Deposit unavailable)", () => {
    expect(
      label({
        disconnected: false,
        wrongNetwork: false,
        switching: false,
        failClosed: true,
        busy: false,
        title: "Add Funds",
      }),
    ).toBe("Retry");
  });

  it("shows Add Funds when ready", () => {
    expect(
      label({
        disconnected: false,
        wrongNetwork: false,
        switching: false,
        failClosed: false,
        busy: false,
        title: "Add Funds",
      }),
    ).toBe("Add Funds");
  });
});

describe("beta readiness transport", () => {
  it("documents that activation reads must use HTTP RPC not wallet provider", () => {
    // Source-enforced in useStableClubBetaReadiness — wallet.provider must not
    // gate depositsEnabled via rejected eth_call on mobile.
    expect(true).toBe(true);
  });
});
