import { cookieStorage, createStorage } from "wagmi";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { base } from "@reown/appkit/networks";
import {
  readWalletConnectProjectId,
  WALLETCONNECT_PROJECT_ID_ENV,
} from "@/lib/wallet/appkit-config";

/**
 * SSR-safe Wagmi adapter for Reown AppKit.
 * Project ID is never logged. Module uses a placeholder when unset so tests can load;
 * createAppKit must only run when a real ID is present.
 */
export const appKitPrimaryNetwork = base;

export const appKitNetworkList = [base] as const;

const projectId = readWalletConnectProjectId() ?? "";

export const wagmiAdapter = new WagmiAdapter({
  storage: createStorage({
    storage: cookieStorage,
  }),
  ssr: true,
  projectId: projectId || "00000000000000000000000000000000",
  networks: [...appKitNetworkList],
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;

export function requireWalletConnectProjectId(): string {
  const id = readWalletConnectProjectId();
  if (!id) {
    throw new Error(`${WALLETCONNECT_PROJECT_ID_ENV} is required`);
  }
  return id;
}

export function hasWalletConnectProjectId(): boolean {
  return Boolean(readWalletConnectProjectId());
}
