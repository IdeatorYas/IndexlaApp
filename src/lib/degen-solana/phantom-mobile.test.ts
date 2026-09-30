import { describe, expect, it } from "vitest";
import {
  buildPhantomBrowseCustomScheme,
  buildPhantomBrowseUniversalLink,
  buildPhantomOpenInAppHref,
  formatWalletStatusLine,
  hasPhantomHandoffFlag,
  isMobileUserAgent,
  isPhantomProviderPresent,
  withPhantomHandoffFlag,
} from "@/lib/degen-solana/phantom-mobile";

const PRODUCT =
  "https://app.indexla.tech/app/degen-club/product/solana-memecoin-index?tab=buy";

describe("phantom-mobile detection", () => {
  it("detects mobile UAs", () => {
    expect(
      isMobileUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
      ),
    ).toBe(true);
    expect(
      isMobileUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36",
      ),
    ).toBe(false);
  });

  it("detects Phantom via window.phantom, not UA", () => {
    expect(isPhantomProviderPresent(undefined)).toBe(false);
    const fake = {
      phantom: { solana: { isPhantom: true, connect: () => undefined } },
    } as unknown as Window;
    expect(isPhantomProviderPresent(fake)).toBe(true);
    const legacy = {
      solana: { isPhantom: true, connect: () => undefined },
    } as unknown as Window;
    expect(isPhantomProviderPresent(legacy)).toBe(true);
  });
});

describe("phantom browse deep links", () => {
  it("builds universal browse link preserving full product URL + handoff flag", () => {
    const href = buildPhantomOpenInAppHref(PRODUCT);
    expect(href.startsWith("https://phantom.app/ul/browse/")).toBe(true);
    const encoded = href.split("/ul/browse/")[1]!.split("?")[0]!;
    const decoded = decodeURIComponent(encoded);
    expect(decoded).toContain(PRODUCT.split("?")[0]!);
    expect(decoded).toContain("ixl_phantom=1");
    // Must NOT be an Android Intent that falls back to download
    expect(href.startsWith("intent://")).toBe(false);
    expect(href).not.toContain("browser_fallback_url");
  });

  it("builds custom scheme fallback", () => {
    const href = buildPhantomBrowseCustomScheme(PRODUCT);
    expect(href.startsWith("phantom://browse/")).toBe(true);
    expect(href).toContain(encodeURIComponent(PRODUCT));
  });

  it("withPhantomHandoffFlag / hasPhantomHandoffFlag round-trip", () => {
    const flagged = withPhantomHandoffFlag(PRODUCT);
    expect(hasPhantomHandoffFlag(flagged)).toBe(true);
    expect(hasPhantomHandoffFlag(PRODUCT)).toBe(false);
  });

  it("status line includes stage and phantom flag", () => {
    const line = formatWalletStatusLine({
      stage: "handoff",
      phantomPresent: false,
      mobile: true,
      error: "no inject",
    });
    expect(line).toContain("stage=handoff");
    expect(line).toContain("phantom=no");
    expect(line).toContain("err=no inject");
  });

  it("universal link encodes ref", () => {
    const href = buildPhantomBrowseUniversalLink(PRODUCT, "https://app.indexla.tech");
    expect(href).toContain(`ref=${encodeURIComponent("https://app.indexla.tech")}`);
  });
});
