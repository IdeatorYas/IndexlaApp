/**
 * Phantom mobile handoff — open the current product URL inside Phantom's
 * in-app browser via the supported browse deep link.
 * Docs: https://docs.phantom.com/phantom-deeplinks/other-methods/browse
 */

export function isMobileUserAgent(ua: string): boolean {
  return /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
    ua,
  );
}

/** True when the page is already running inside Phantom's in-app browser. */
export function isPhantomInAppBrowser(ua: string): boolean {
  return /Phantom/i.test(ua);
}

export function isAndroidUserAgent(ua: string): boolean {
  return /Android/i.test(ua);
}

/**
 * Build Phantom browse universal link preserving the full product URL.
 * Format: https://phantom.app/ul/browse/<url>?ref=<ref>
 */
export function buildPhantomBrowseUniversalLink(
  productUrl: string,
  refUrl: string = productUrl,
): string {
  const encodedUrl = encodeURIComponent(productUrl);
  const encodedRef = encodeURIComponent(refUrl);
  return `https://phantom.app/ul/browse/${encodedUrl}?ref=${encodedRef}`;
}

/**
 * Android browsers often mishandle Universal Links — use an Intent URL that
 * targets the Phantom package, with App Store / Play fallback via browser_fallback_url.
 */
export function buildPhantomBrowseAndroidIntent(
  productUrl: string,
  refUrl: string = productUrl,
): string {
  const encodedUrl = encodeURIComponent(productUrl);
  const encodedRef = encodeURIComponent(refUrl);
  const fallback = encodeURIComponent("https://phantom.app/download");
  // Reconstructs https://phantom.app/ul/browse/<url>?ref=<ref>
  return (
    `intent://ul/browse/${encodedUrl}?ref=${encodedRef}` +
    `#Intent;scheme=https;host=phantom.app;package=app.phantom;` +
    `S.browser_fallback_url=${fallback};end`
  );
}

/** Pick the best handoff href for the given UA. */
export function buildPhantomOpenInAppHref(
  productUrl: string,
  ua: string,
  refUrl: string = productUrl,
): string {
  if (isAndroidUserAgent(ua)) {
    return buildPhantomBrowseAndroidIntent(productUrl, refUrl);
  }
  return buildPhantomBrowseUniversalLink(productUrl, refUrl);
}

/** Current page URL for handoff (path + query + hash preserved). */
export function currentProductUrl(): string {
  if (typeof window === "undefined") return "https://app.indexla.tech/app";
  return window.location.href;
}
