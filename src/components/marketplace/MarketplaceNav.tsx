"use client";

import type { ProductTab } from "@/lib/domain/marketplace";
import { PRODUCT_TABS } from "@/lib/domain/marketplace-filters";

export function MarketplaceTitle({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={[
        "mx-auto text-center",
        compact ? "max-w-xl" : "max-w-2xl",
      ].join(" ")}
    >
      <h2
        className={[
          "app-display font-bold tracking-tight text-app-ink",
          compact ? "text-lg sm:text-xl" : "text-2xl sm:text-[1.75rem]",
        ].join(" ")}
      >
        Marketplace
      </h2>
    </div>
  );
}

export function PrimaryProductTabs({
  selected,
  onSelect,
  compact = false,
}: {
  selected: ProductTab;
  onSelect: (id: ProductTab) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={[
        "mx-auto grid max-w-lg grid-cols-2",
        compact ? "gap-2" : "gap-2.5 sm:gap-3",
      ].join(" ")}
      role="tablist"
      aria-label="Marketplace product type"
    >
      {PRODUCT_TABS.map((tab) => {
        const active = tab.id === selected;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(tab.id)}
            className={[
              "app-marketplace-nav-tab rounded-[14px]",
              compact
                ? "min-h-[48px] px-3 py-3 text-[12px] sm:text-[13px]"
                : "min-h-[52px] px-4 py-3.5 text-[13px] sm:min-h-[56px] sm:text-sm",
              active ? "app-marketplace-nav-tab-active scale-[1.02]" : "opacity-95",
            ].join(" ")}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
