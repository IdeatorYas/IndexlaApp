/**
 * Phantom mobile handoff + provider detection.
 *
 * Critical facts from Phantom docs:
 * - Detect install / in-app via window.phantom.solana — NOT User-Agent.
 * - Browse deeplink: https://phantom.app/ul/browse/<urlencoded>?ref=<urlencoded>
 * - Do NOT use Android Intent with browser_fallback_url=download — that sends
 *   installed-Phantom users to the install page when App Links fail.
 */

export const PHANTOM_HANDOFF_PARAM = "ixl_phantom";

export function isMobileUserAgent(ua: string): boolean {
  return /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
    ua,
  );
}

export function isAndroidUserAgent(ua: string): boolean {
  return /Android/i.test(ua);
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

/**
 * Build Phantom browse universal link preserving the full product URL.
 * Always use https://phantom.app/ul/browse — never Intent+download fallback.
 */
export function buildPhantomBrowseUniversalLink(
  productUrl: string,
  refUrl: string = productUrl,
): string {
  const encodedUrl = encodeURIComponent(productUrl);
  const encodedRef = encodeURIComponent(refUrl);
  return `https://phantom.app/ul/browse/${encodedUrl}?ref=${encodedRef}`;
}

/** Custom-scheme fallback (some Android browsers). Same browse target. */
export function buildPhantomBrowseCustomScheme(
  productUrl: string,
  refUrl: string = productUrl,
): string {
  const encodedUrl = encodeURIComponent(productUrl);
  const encodedRef = encodeURIComponent(refUrl);
  return `phantom://browse/${encodedUrl}?ref=${encodedRef}`;
}

/** Append handoff flag so the page auto-connects after Phantom opens it. */
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

/** Strip handoff flag from the address bar after connect (clean URL). */
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

/**
 * Best handoff href. Universal link only — Intent+download was sending
 * users with Phantom installed to the store / download page.
 */
export function buildPhantomOpenInAppHref(
  productUrl: string,
  _ua?: string,
  refUrl?: string,
): string {
  const target = withPhantomHandoffFlag(productUrl);
  const ref = refUrl ?? productUrl;
  return buildPhantomBrowseUniversalLink(target, ref);
}

export function currentProductUrl(): string {
  if (typeof window === "undefined") return "https://app.indexla.tech/app";
  return window.location.href;
}

export type WalletConnectStage =
  | "idle"
  | "scanning"
  | "handoff"
  | "injected"
  | "connecting"
  | "connected"
  | "error";

export function formatWalletStatusLine(opts: {
  stage: WalletConnectStage;
  phantomPresent: boolean;
  mobile: boolean;
  publicKey?: string | null;
  error?: string | null;
}): string {
  const bits = [
    `stage=${opts.stage}`,
    `phantom=${opts.phantomPresent ? "yes" : "no"}`,
    `mobile=${opts.mobile ? "yes" : "no"}`,
  ];
  if (opts.publicKey) bits.push(`pk=${opts.publicKey.slice(0, 4)}…${opts.publicKey.slice(-4)}`);
  if (opts.error) bits.push(`err=${opts.error}`);
  return bits.join(" · ");
}
