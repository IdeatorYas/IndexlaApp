import { describe, expect, it } from "vitest";
import {
  isMobileWalletUserAgent,
  isWalletConnectLikeConnector,
  shouldPreferChunkedGatewayExits,
} from "./prefer-chunked-gateway-exits";

describe("prefer-chunked-gateway-exits", () => {
  it("detects mobile UA and WalletConnect-like connectors", () => {
    expect(isMobileWalletUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS)")).toBe(
      true,
    );
    expect(isMobileWalletUserAgent("MetaMaskMobile/7.0")).toBe(true);
    expect(
      isMobileWalletUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120",
      ),
    ).toBe(false);
    expect(isWalletConnectLikeConnector("walletConnect", "WalletConnect")).toBe(
      true,
    );
    expect(isWalletConnectLikeConnector("injected", "MetaMask")).toBe(false);
  });

  it("chunks on mobile UA; oneshot on desktop MetaMask extension", () => {
    expect(
      shouldPreferChunkedGatewayExits({
        connectorId: "injected",
        connectorName: "MetaMask",
        userAgent: "Mozilla/5.0 (iPhone) MetaMaskMobile",
        provider: { isMetaMask: true },
      }),
    ).toBe(true);

    expect(
      shouldPreferChunkedGatewayExits({
        connectorId: "walletConnect",
        connectorName: "WalletConnect",
        userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/120",
      }),
    ).toBe(true);

    expect(
      shouldPreferChunkedGatewayExits({
        connectorId: "injected",
        connectorName: "MetaMask",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120",
        provider: { isMetaMask: true },
      }),
    ).toBe(false);
  });
});
