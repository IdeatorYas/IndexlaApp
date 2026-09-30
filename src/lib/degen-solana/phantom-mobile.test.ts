import { describe, expect, it } from "vitest";
import {
  buildPhantomBrowseAndroidIntent,
  buildPhantomBrowseUniversalLink,
  buildPhantomOpenInAppHref,
  isAndroidUserAgent,
  isMobileUserAgent,
  isPhantomInAppBrowser,
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
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36",
      ),
    ).toBe(true);
    expect(
      isMobileUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36",
      ),
    ).toBe(false);
  });

  it("detects Phantom in-app browser", () => {
    expect(
      isPhantomInAppBrowser(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Phantom/25.0",
      ),
    ).toBe(true);
    expect(
      isPhantomInAppBrowser(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15",
      ),
    ).toBe(false);
  });

  it("detects Android", () => {
    expect(isAndroidUserAgent("Mozilla/5.0 (Linux; Android 14)")).toBe(true);
    expect(isAndroidUserAgent("Mozilla/5.0 (iPhone)")).toBe(false);
  });
});

describe("phantom browse deep links", () => {
  it("builds universal browse link preserving full product URL", () => {
    const href = buildPhantomBrowseUniversalLink(PRODUCT);
    expect(href.startsWith("https://phantom.app/ul/browse/")).toBe(true);
    expect(href).toContain(encodeURIComponent(PRODUCT));
    expect(href).toContain(`ref=${encodeURIComponent(PRODUCT)}`);
    // Round-trip: path segment decodes back to product URL
    const encoded = href.split("/ul/browse/")[1]!.split("?")[0]!;
    expect(decodeURIComponent(encoded)).toBe(PRODUCT);
  });

  it("builds Android intent targeting Phantom package", () => {
    const href = buildPhantomBrowseAndroidIntent(PRODUCT);
    expect(href.startsWith("intent://ul/browse/")).toBe(true);
    expect(href).toContain("package=app.phantom");
    expect(href).toContain(encodeURIComponent(PRODUCT));
    expect(href).toContain("S.browser_fallback_url=");
  });

  it("picks intent on Android and universal link on iOS", () => {
    const android = buildPhantomOpenInAppHref(
      PRODUCT,
      "Mozilla/5.0 (Linux; Android 14) Mobile",
    );
    const ios = buildPhantomOpenInAppHref(
      PRODUCT,
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)",
    );
    expect(android.startsWith("intent://")).toBe(true);
    expect(ios.startsWith("https://phantom.app/ul/browse/")).toBe(true);
  });
});
