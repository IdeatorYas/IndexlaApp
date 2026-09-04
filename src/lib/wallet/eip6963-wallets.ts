import type { EIP1193Provider } from "viem";

export type Eip6963ProviderInfo = {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
};

export type Eip6963ProviderDetail = {
  info: Eip6963ProviderInfo;
  provider: EIP1193Provider;
};

export type WalletListEntry = {
  id: string;
  name: string;
  icon: string;
  rdns: string | null;
  installed: boolean;
  provider: EIP1193Provider | null;
  priority: number;
  mobileDeepLink: string | null;
};

/** Announce event per EIP-6963. */
export const EIP6963_ANNOUNCE_EVENT = "eip6963:announceProvider";
export const EIP6963_REQUEST_EVENT = "eip6963:requestProvider";

const PRIORITY_RDNS = [
  "app.phantom",
  "app.backpack",
  "io.metamask",
  "com.okex.wallet",
] as const;

const PRIORITY_NAME_MATCH: { test: RegExp; priority: number; id: string }[] = [
  { test: /phantom/i, priority: 0, id: "phantom" },
  { test: /backpack/i, priority: 1, id: "backpack" },
  { test: /metamask/i, priority: 2, id: "metamask" },
  { test: /okx/i, priority: 3, id: "okx" },
];

const FALLBACK_WALLETS: Omit<WalletListEntry, "provider" | "installed">[] = [
  {
    id: "phantom",
    name: "Phantom",
    icon: "https://raw.githubusercontent.com/Phantom-wallet/brand/master/phantom-icon-purple.png",
    rdns: "app.phantom",
    priority: 0,
    mobileDeepLink: "https://phantom.app/ul/browse/",
  },
  {
    id: "backpack",
    name: "Backpack",
    icon: "https://backpack.app/favicon.ico",
    rdns: "app.backpack",
    priority: 1,
    mobileDeepLink: "https://backpack.app/",
  },
  {
    id: "metamask",
    name: "MetaMask",
    icon: "https://raw.githubusercontent.com/MetaMask/brand-resources/master/SVG/SVG_MetaMask_Icon_Color.svg",
    rdns: "io.metamask",
    priority: 2,
    mobileDeepLink: "https://metamask.app.link/dapp/",
  },
  {
    id: "okx",
    name: "OKX Wallet",
    icon: "https://static.okx.com/cdn/assets/imgs/247/58E63FEA47A2B7D7.png",
    rdns: "com.okex.wallet",
    priority: 3,
    mobileDeepLink: "https://www.okx.com/download",
  },
];

function priorityFor(info: Eip6963ProviderInfo): number {
  const rdnsIdx = PRIORITY_RDNS.findIndex((r) => r === info.rdns.toLowerCase());
  if (rdnsIdx >= 0) return rdnsIdx;
  for (const row of PRIORITY_NAME_MATCH) {
    if (row.test.test(info.name) || row.test.test(info.rdns)) return row.priority;
  }
  return 100;
}

function idFor(info: Eip6963ProviderInfo): string {
  for (const row of PRIORITY_NAME_MATCH) {
    if (row.test.test(info.name) || row.test.test(info.rdns)) return row.id;
  }
  return info.rdns || info.uuid;
}

/** Discover EIP-6963 providers announced in the browser. */
export function discoverEip6963Providers(): Eip6963ProviderDetail[] {
  if (typeof window === "undefined") return [];
  const map = new Map<string, Eip6963ProviderDetail>();

  const onAnnounce = (event: Event) => {
    const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail;
    if (!detail?.info?.uuid || !detail.provider) return;
    map.set(detail.info.uuid, detail);
  };

  window.addEventListener(EIP6963_ANNOUNCE_EVENT, onAnnounce);
  window.dispatchEvent(new Event(EIP6963_REQUEST_EVENT));
  window.removeEventListener(EIP6963_ANNOUNCE_EVENT, onAnnounce);

  return Array.from(map.values());
}

export function buildWalletList(discovered: readonly Eip6963ProviderDetail[]): WalletListEntry[] {
  const byRdns = new Map<string, Eip6963ProviderDetail>();
  for (const d of discovered) {
    byRdns.set(d.info.rdns.toLowerCase(), d);
  }

  const entries: WalletListEntry[] = [];
  const seen = new Set<string>();

  for (const fallback of FALLBACK_WALLETS) {
    const match =
      (fallback.rdns ? byRdns.get(fallback.rdns) : undefined) ??
      discovered.find((d) => idFor(d.info) === fallback.id);
    entries.push({
      ...fallback,
      installed: Boolean(match),
      provider: match?.provider ?? null,
      icon: match?.info.icon || fallback.icon,
      name: match?.info.name || fallback.name,
    });
    if (match) seen.add(match.info.uuid);
  }

  for (const d of discovered) {
    if (seen.has(d.info.uuid)) continue;
    entries.push({
      id: idFor(d.info),
      name: d.info.name,
      icon: d.info.icon,
      rdns: d.info.rdns,
      installed: true,
      provider: d.provider,
      priority: priorityFor(d.info),
      mobileDeepLink: null,
    });
  }

  // Legacy window.ethereum if nothing announced it
  if (typeof window !== "undefined") {
    const eth = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
    if (eth && !entries.some((e) => e.provider === eth)) {
      const already = entries.find((e) => e.id === "metamask" && !e.provider);
      if (already) {
        already.provider = eth;
        already.installed = true;
      } else if (!discovered.length) {
        entries.push({
          id: "injected",
          name: "Browser Wallet",
          icon: FALLBACK_WALLETS[2]!.icon,
          rdns: null,
          installed: true,
          provider: eth,
          priority: 50,
          mobileDeepLink: null,
        });
      }
    }
  }

  return entries.sort((a, b) => {
    if (a.installed !== b.installed) return a.installed ? -1 : 1;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.name.localeCompare(b.name);
  });
}

export function filterWalletsByQuery(
  wallets: readonly WalletListEntry[],
  query: string,
): WalletListEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...wallets];
  return wallets.filter(
    (w) => w.name.toLowerCase().includes(q) || (w.rdns?.toLowerCase().includes(q) ?? false),
  );
}

export function isPriorityWalletOrder(names: readonly string[]): boolean {
  const expected = ["Phantom", "Backpack", "MetaMask", "OKX Wallet"];
  return expected.every((name, i) => names[i]?.toLowerCase().includes(name.split(" ")[0]!.toLowerCase()));
}
