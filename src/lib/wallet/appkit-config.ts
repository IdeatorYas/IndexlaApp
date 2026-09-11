/**
 * Reown AppKit configuration helpers.
 * Project ID is read from env only — never hardcode or log the value.
 */

import { base } from "@reown/appkit/networks";

export const WALLETCONNECT_PROJECT_ID_ENV = "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID" as const;

/** Official Reown WalletGuide IDs — Phantom → Backpack → MetaMask → OKX. */
export const FEATURED_WALLET_IDS = [
  "a797aa35c0fadbfc1a53e7f675162ed5226968b44a19ee3d24385c64d1d3c393", // Phantom
  "2bd8c14e035c2d48f184aaa168559e86b0e3433228d3c4075900a221785019b0", // Backpack
  "c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96", // MetaMask
  "971e689d0a5be527bac79629b4ee9b925e82208e5168b733496a09c0faed0709", // OKX Wallet
] as const;

export const FEATURED_WALLET_NAMES = [
  "Phantom",
  "Backpack",
  "MetaMask",
  "OKX Wallet",
] as const;

export const APPKIT_METADATA = {
  name: "INDEXLA",
  description: "INDEXLA — non-custodial portfolio automation",
  url: "https://app.indexla.tech",
  icons: ["https://app.indexla.tech/logo/indexla-logo-transparent.png"],
} as const;

/**
 * WalletConnect metadata.url must match the page origin or AppKit warns / can misbehave.
 * Prefer the live browser origin; fall back to NEXT_PUBLIC_APP_ORIGIN, then env-aware defaults.
 */
export function resolveAppKitMetadataUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const explicit = env.NEXT_PUBLIC_APP_ORIGIN?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }
  // Prefer live origin only for the real process env (not injected test objects / jsdom).
  if (
    env === process.env &&
    typeof window !== "undefined" &&
    window.location?.origin
  ) {
    return window.location.origin;
  }
  if (env.NODE_ENV === "development") {
    return "http://localhost:3456";
  }
  return APPKIT_METADATA.url;
}

/** Base is the primary required network. */
export const appKitNetworks = [base] as const;

export function readWalletConnectProjectId(
  env?: NodeJS.ProcessEnv,
): string | null {
  // Static property access is required so Next.js inlines NEXT_PUBLIC_* into the client bundle.
  // Dynamic env[key] lookup is not replaced and yields undefined in the browser.
  const raw = (
    env
      ? env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
      : process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
  )?.trim();
  if (!raw) return null;
  return raw;
}

export type AppKitCreateOptionsShape = {
  projectId: string;
  metadata: {
    name: typeof APPKIT_METADATA.name;
    description: typeof APPKIT_METADATA.description;
    url: string;
    icons: typeof APPKIT_METADATA.icons;
  };
  networks: typeof appKitNetworks;
  defaultNetwork: (typeof appKitNetworks)[0];
  featuredWalletIds: string[];
  allWallets: "SHOW";
  enableWalletConnect: true;
  enableEIP6963: true;
  enableInjected: true;
  enableCoinbase: false;
};

export function buildAppKitCreateOptions(projectId: string): AppKitCreateOptionsShape {
  if (!projectId.trim()) {
    throw new Error(`${WALLETCONNECT_PROJECT_ID_ENV} is required`);
  }
  return {
    projectId: projectId.trim(),
    metadata: {
      ...APPKIT_METADATA,
      url: resolveAppKitMetadataUrl(),
    },
    networks: appKitNetworks,
    defaultNetwork: appKitNetworks[0],
    featuredWalletIds: [...FEATURED_WALLET_IDS],
    allWallets: "SHOW",
    enableWalletConnect: true,
    enableEIP6963: true,
    enableInjected: true,
    enableCoinbase: false,
  };
}
