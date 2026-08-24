import type { DegenDiscoverFilter } from "@/lib/domain/degen-club";
import { DegenChainLogo } from "@/components/degen-club/DegenChainLogo";

const CATEGORIES: {
  id: DegenDiscoverFilter;
  label: string;
  chain:
    | "all"
    | "ethereum"
    | "solana"
    | "base"
    | "bnb"
    | "sui"
    | "robinhood";
}[] = [
  { id: "all", label: "All", chain: "all" },
  { id: "ethereum", label: "Ethereum", chain: "ethereum" },
  { id: "solana", label: "Solana", chain: "solana" },
  { id: "base", label: "Base", chain: "base" },
  { id: "bnb", label: "BNB Chain", chain: "bnb" },
  { id: "sui", label: "Sui", chain: "sui" },
  { id: "robinhood", label: "Robinhood Chain", chain: "robinhood" },
];

export function DegenChainCategories({
  active,
  onSelect,
}: {
  active: DegenDiscoverFilter;
  onSelect: (id: DegenDiscoverFilter) => void;
}) {
  return (
    <div
      className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-4"
      role="tablist"
      aria-label="Chain categories"
    >
      {CATEGORIES.map((cat) => {
        const selected = active === cat.id;
        return (
          <button
            key={cat.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(cat.id)}
            className={[
              "degen-chain-cat",
              selected ? "degen-chain-cat-active" : "",
            ].join(" ")}
          >
            <span className="degen-chain-cat-icon">
              <DegenChainLogo chain={cat.chain} size={32} />
            </span>
            <span className="degen-chain-cat-label">{cat.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function DegenMultiChainBanner() {
  return (
    <div className="degen-multichain-banner">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--degen-neon-gold)]">
            Multi-Chain Memecoins
          </p>
          <p className="mt-0.5 text-sm font-bold text-[var(--degen-ink)]">
            Cross-chain degen portfolios · One basket · Multiple chains
          </p>
        </div>
        <div className="degen-multichain-logos ml-auto flex flex-wrap items-center justify-end gap-2">
          {(
            ["ethereum", "solana", "base", "bnb", "sui", "robinhood"] as const
          ).map((chain) => (
            <span
              key={chain}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--degen-panel-border)] bg-[var(--degen-bg-soft)] shadow-[0_0_12px_rgba(56,189,248,0.18)]"
              title={
                chain === "bnb"
                  ? "BNB Chain"
                  : chain === "robinhood"
                    ? "Robinhood Chain"
                    : chain.charAt(0).toUpperCase() + chain.slice(1)
              }
            >
              <DegenChainLogo chain={chain} size={24} />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
