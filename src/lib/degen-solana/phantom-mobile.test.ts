import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  buildPhantomBrowseUniversalLink,
  buildPhantomOpenInAppHref,
  hasPhantomHandoffFlag,
  isMobileUserAgent,
  isPhantomProviderPresent,
  withPhantomHandoffFlag,
} from "@/lib/degen-solana/phantom-mobile";

const PRODUCT =
  "https://app.indexla.tech/app/degen-club/product/solana-memecoin-index?tab=buy";

describe("phantom-mobile", () => {
  it("detects mobile UAs", () => {
    expect(isMobileUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")).toBe(
      true,
    );
    expect(isMobileUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(
      false,
    );
  });

  it("detects Phantom via window.phantom", () => {
    expect(isPhantomProviderPresent(undefined)).toBe(false);
    expect(
      isPhantomProviderPresent({
        phantom: { solana: { isPhantom: true, connect: () => undefined } },
      } as unknown as Window),
    ).toBe(true);
  });

  it("builds browse handoff with product URL + flag (no Intent download)", () => {
    const href = buildPhantomOpenInAppHref(PRODUCT);
    expect(href.startsWith("https://phantom.app/ul/browse/")).toBe(true);
    expect(href.startsWith("intent://")).toBe(false);
    const encoded = href.split("/ul/browse/")[1]!.split("?")[0]!;
    expect(decodeURIComponent(encoded)).toContain("ixl_phantom=1");
  });

  it("handoff flag round-trip", () => {
    expect(hasPhantomHandoffFlag(withPhantomHandoffFlag(PRODUCT))).toBe(true);
    expect(hasPhantomHandoffFlag(PRODUCT)).toBe(false);
  });

  it("universal link encodes ref", () => {
    const href = buildPhantomBrowseUniversalLink(
      PRODUCT,
      "https://app.indexla.tech",
    );
    expect(href).toContain(
      `ref=${encodeURIComponent("https://app.indexla.tech")}`,
    );
  });
});

// silence unused in case tree-shaking complains in some runners
void vi;
void beforeEach;
void afterEach;
