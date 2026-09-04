"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { createAppKit } from "@reown/appkit/react";
import { base } from "@reown/appkit/networks";
import { WagmiProvider, cookieToInitialState, type Config } from "wagmi";
import {
  APPKIT_METADATA,
  FEATURED_WALLET_IDS,
  readWalletConnectProjectId,
  resolveAppKitMetadataUrl,
} from "@/lib/wallet/appkit-config";
import {
  hasWalletConnectProjectId,
  wagmiAdapter,
} from "@/lib/wallet/wagmi-config";

/**
 * Reown requires createAppKit before any useAppKit hook (including during SSR of client trees).
 * Initialize once at module scope when the public project ID is present.
 */
const projectId = readWalletConnectProjectId();
if (projectId) {
  createAppKit({
    adapters: [wagmiAdapter],
    projectId,
    networks: [base],
    defaultNetwork: base,
    metadata: {
      name: APPKIT_METADATA.name,
      description: APPKIT_METADATA.description,
      url: resolveAppKitMetadataUrl(),
      icons: [...APPKIT_METADATA.icons],
    },
    featuredWalletIds: [...FEATURED_WALLET_IDS],
    allWallets: "SHOW",
    enableWalletConnect: true,
    enableEIP6963: true,
    enableInjected: true,
    enableCoinbase: false,
    features: {
      analytics: false,
      email: false,
      socials: false,
    },
  });
}

function readInitialWagmiState(config: Config, cookies: string | null) {
  if (!cookies) return undefined;
  try {
    return cookieToInitialState(config, cookies);
  } catch {
    try {
      // Prior sessions may store the wagmi cookie value URL-encoded (%7B...).
      const decoded = cookies
        .split("; ")
        .map((part) => {
          const eq = part.indexOf("=");
          if (eq < 0) return part;
          const key = part.slice(0, eq);
          const value = part.slice(eq + 1);
          try {
            return `${key}=${decodeURIComponent(value)}`;
          } catch {
            return part;
          }
        })
        .join("; ");
      return cookieToInitialState(config, decoded);
    } catch {
      return undefined;
    }
  }
}

export function AppKitProvider({
  children,
  cookies = null,
}: {
  children: ReactNode;
  cookies?: string | null;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const initialState = readInitialWagmiState(
    wagmiAdapter.wagmiConfig as Config,
    cookies,
  );

  return (
    <WagmiProvider
      config={wagmiAdapter.wagmiConfig as Config}
      initialState={initialState}
    >
      <QueryClientProvider client={queryClient}>
        {!hasWalletConnectProjectId() ? (
          <div
            className="sr-only"
            data-testid="walletconnect-project-id-missing"
          >
            WalletConnect project ID missing
          </div>
        ) : null}
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
