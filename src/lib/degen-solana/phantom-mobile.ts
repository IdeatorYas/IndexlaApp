/**
 * Phantom mobile handoff + provider detection.
 * Detect via window.phantom — not User-Agent.
 * Browse UL: https://phantom.app/ul/browse/<url>?ref=<ref>
 */

export const PHANTOM_HANDOFF_PARAM = "ixl_phantom";

export function isMobileUserAgent(ua: string): boolean {
  return /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
    ua,
  );
}

/** True when Phantom has injected its provider (extension OR mobile in-app). */
export function isPhantomProviderPresent(
  win: Window | null | undefined = typeof window !== "undefined" ? window : null,
): boolean {
  if (!win) return false;
  const w = win as Window & {
    phantom?: { solana?: { isPhantom?: boolean; connect?: unknown } };
    solana?: { isPhantom?: boolean; connect?: unknown };
  };
  if (w.phantom?.solana?.isPhantom) return true;
  if (typeof w.phantom?.solana?.connect === "function") return true;
  if (w.solana?.isPhantom) return true;
  return false;
}

export function buildPhantomBrowseUniversalLink(
  productUrl: string,
  refUrl: string = productUrl,
): string {
  const encodedUrl = encodeURIComponent(productUrl);
  const encodedRef = encodeURIComponent(refUrl);
  return `https://phantom.app/ul/browse/${encodedUrl}?ref=${encodedRef}`;
}

export function withPhantomHandoffFlag(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set(PHANTOM_HANDOFF_PARAM, "1");
    return u.toString();
  } catch {
    const join = url.includes("?") ? "&" : "?";
    return `${url}${join}${PHANTOM_HANDOFF_PARAM}=1`;
  }
}

export function hasPhantomHandoffFlag(
  href: string = typeof window !== "undefined" ? window.location.href : "",
): boolean {
  try {
    return new URL(href).searchParams.get(PHANTOM_HANDOFF_PARAM) === "1";
  } catch {
    return false;
  }
}

export function clearPhantomHandoffFlagFromUrl(): void {
  if (typeof window === "undefined") return;
  try {
    const u = new URL(window.location.href);
    if (!u.searchParams.has(PHANTOM_HANDOFF_PARAM)) return;
    u.searchParams.delete(PHANTOM_HANDOFF_PARAM);
    window.history.replaceState({}, "", u.toString());
  } catch {
    /* ignore */
  }
}

/** Browse handoff preserving product URL + auto-connect flag. */
export function buildPhantomOpenInAppHref(
  productUrl: string,
  refUrl?: string,
): string {
  const target = withPhantomHandoffFlag(productUrl);
  return buildPhantomBrowseUniversalLink(target, refUrl ?? productUrl);
}

export function currentProductUrl(): string {
  if (typeof window === "undefined") return "https://app.indexla.tech/app";
  return window.location.href;
}

/** Launch Phantom in-app browser with the current product URL. */
export function launchPhantomHandoff(productUrl?: string): void {
  const url = productUrl ?? currentProductUrl();
  const href = buildPhantomOpenInAppHref(url);
  try {
    window.location.assign(href);
  } catch {
    window.location.href = href;
  }
}
