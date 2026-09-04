import { describe, expect, it } from "vitest";
import {
  FEATURED_WALLET_IDS,
  FEATURED_WALLET_NAMES,
  APPKIT_METADATA,
  buildAppKitCreateOptions,
  readWalletConnectProjectId,
  resolveAppKitMetadataUrl,
  appKitNetworks,
} from "@/lib/wallet/appkit-config";
import { filterWalletsByQuery, isPriorityWalletOrder } from "@/lib/wallet/eip6963-wallets";

describe("Reown AppKit wallet config", () => {
  it("prioritizes Phantom, Backpack, MetaMask, OKX with official WalletGuide IDs", () => {
    expect(FEATURED_WALLET_NAMES).toEqual([
      "Phantom",
      "Backpack",
      "MetaMask",
      "OKX Wallet",
    ]);
    expect(FEATURED_WALLET_IDS).toHaveLength(4);
    expect(FEATURED_WALLET_IDS[0]).toBe(
      "a797aa35c0fadbfc1a53e7f675162ed5226968b44a19ee3d24385c64d1d3c393",
    );
    expect(FEATURED_WALLET_IDS[1]).toBe(
      "2bd8c14e035c2d48f184aaa168559e86b0e3433228d3c4075900a221785019b0",
    );
    expect(FEATURED_WALLET_IDS[2]).toBe(
      "c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96",
    );
    expect(FEATURED_WALLET_IDS[3]).toBe(
      "971e689d0a5be527bac79629b4ee9b925e82208e5168b733496a09c0faed0709",
    );
    expect(isPriorityWalletOrder([...FEATURED_WALLET_NAMES])).toBe(true);
  });

  it("uses INDEXLA metadata and Base as primary network", () => {
    expect(APPKIT_METADATA.name).toBe("INDEXLA");
    expect(APPKIT_METADATA.url).toBe("https://app.indexla.tech");
    expect(appKitNetworks[0]?.id).toBe(8453);
  });

  it("resolves metadata URL for local development without hardcoding production origin", () => {
    expect(
      resolveAppKitMetadataUrl({ NODE_ENV: "development" } as NodeJS.ProcessEnv),
    ).toBe("http://localhost:3456");
    expect(
      resolveAppKitMetadataUrl({
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_ORIGIN: "https://app.indexla.tech",
      } as NodeJS.ProcessEnv),
    ).toBe("https://app.indexla.tech");
  });

  it("builds AppKit options with catalogue, search (allWallets SHOW), and EIP-6963", () => {
    const opts = buildAppKitCreateOptions("test-project-id-not-a-secret");
    expect(opts.allWallets).toBe("SHOW");
    expect(opts.enableWalletConnect).toBe(true);
    expect(opts.enableEIP6963).toBe(true);
    expect(opts.enableInjected).toBe(true);
    expect(opts.featuredWalletIds).toEqual([...FEATURED_WALLET_IDS]);
    expect(opts.defaultNetwork?.id).toBe(8453);
    expect(opts.metadata.name).toBe("INDEXLA");
  });

  it("supports wallet catalogue search filtering", () => {
    const sample = [
      {
        id: "phantom",
        name: "Phantom",
        icon: "",
        rdns: "app.phantom",
        installed: true,
        provider: null,
        priority: 0,
        mobileDeepLink: null,
      },
      {
        id: "metamask",
        name: "MetaMask",
        icon: "",
        rdns: "io.metamask",
        installed: true,
        provider: null,
        priority: 2,
        mobileDeepLink: null,
      },
    ];
    expect(filterWalletsByQuery(sample, "meta").map((w) => w.id)).toEqual(["metamask"]);
    expect(filterWalletsByQuery(sample, "").map((w) => w.id)).toEqual(["phantom", "metamask"]);
  });

  it("reads project id from NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID without exposing value", () => {
    const id = readWalletConnectProjectId();
    if (id != null) {
      expect(id.length).toBeGreaterThan(8);
      expect(id.includes(" ")).toBe(false);
    } else {
      expect(id).toBeNull();
    }
  });
});
