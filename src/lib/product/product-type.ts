import type { IndexType, MarketplaceProduct } from "@/lib/domain/marketplace";

export type ProductTypeBadgeId =
  | "crypto-index"
  | "stock-index"
  | "commodities-index"
  | "hybrid-index"
  | "crypto-portfolio"
  | "stock-portfolio"
  | "commodities-portfolio"
  | "hybrid-portfolio";

export interface ProductTypeStyle {
  id: ProductTypeBadgeId;
  label: string;
  color: string;
  glow: string;
  border: string;
  surface: string;
  /** Solid fill for product-name containers */
  fill: string;
  /** High-contrast text on solid fill */
  textOnFill: string;
}

const PRODUCT_TYPE_STYLES: Record<ProductTypeBadgeId, ProductTypeStyle> = {
  "crypto-index": {
    id: "crypto-index",
    label: "Crypto Index",
    color: "#3B82F6",
    glow: "rgba(59,130,246,0.55)",
    border: "rgba(59,130,246,0.7)",
    surface: "rgba(59,130,246,0.18)",
    fill: "#2563EB",
    textOnFill: "#FFFFFF",
  },
  "stock-index": {
    id: "stock-index",
    label: "Stock Index",
    color: "#8B5CF6",
    glow: "rgba(139,92,246,0.55)",
    border: "rgba(139,92,246,0.7)",
    surface: "rgba(139,92,246,0.18)",
    fill: "#7C3AED",
    textOnFill: "#FFFFFF",
  },
  "commodities-index": {
    id: "commodities-index",
    label: "Commodities Index",
    color: "#F59E0B",
    glow: "rgba(245,158,11,0.55)",
    border: "rgba(245,158,11,0.7)",
    surface: "rgba(245,158,11,0.18)",
    fill: "#D97706",
    textOnFill: "#FFFFFF",
  },
  "hybrid-index": {
    id: "hybrid-index",
    label: "Hybrid Index",
    color: "#10B981",
    glow: "rgba(16,185,129,0.55)",
    border: "rgba(16,185,129,0.7)",
    surface: "rgba(16,185,129,0.18)",
    fill: "#059669",
    textOnFill: "#FFFFFF",
  },
  "crypto-portfolio": {
    id: "crypto-portfolio",
    label: "Crypto Portfolio",
    color: "#06B6D4",
    glow: "rgba(6,182,212,0.55)",
    border: "rgba(6,182,212,0.7)",
    surface: "rgba(6,182,212,0.18)",
    fill: "#0891B2",
    textOnFill: "#FFFFFF",
  },
  "stock-portfolio": {
    id: "stock-portfolio",
    label: "Stock Portfolio",
    color: "#EC4899",
    glow: "rgba(236,72,153,0.55)",
    border: "rgba(236,72,153,0.7)",
    surface: "rgba(236,72,153,0.18)",
    fill: "#DB2777",
    textOnFill: "#FFFFFF",
  },
  "commodities-portfolio": {
    id: "commodities-portfolio",
    label: "Commodities Portfolio",
    color: "#F97316",
    glow: "rgba(249,115,22,0.55)",
    border: "rgba(249,115,22,0.7)",
    surface: "rgba(249,115,22,0.18)",
    fill: "#EA580C",
    textOnFill: "#FFFFFF",
  },
  "hybrid-portfolio": {
    id: "hybrid-portfolio",
    label: "Hybrid Portfolio",
    color: "#6366F1",
    glow: "rgba(99,102,241,0.55)",
    border: "rgba(99,102,241,0.7)",
    surface: "rgba(99,102,241,0.18)",
    fill: "#4F46E5",
    textOnFill: "#FFFFFF",
  },
};

function badgeIdFor(
  kind: MarketplaceProduct["kind"],
  indexType: IndexType,
): ProductTypeBadgeId {
  const isIndex = kind === "Index";
  switch (indexType) {
    case "Tokenized Stocks":
      return isIndex ? "stock-index" : "stock-portfolio";
    case "Tokenized Commodities":
      return isIndex ? "commodities-index" : "commodities-portfolio";
    case "Hybrid":
      return isIndex ? "hybrid-index" : "hybrid-portfolio";
    case "Crypto":
    default:
      return isIndex ? "crypto-index" : "crypto-portfolio";
  }
}

export function getProductTypeStyle(product: {
  kind: MarketplaceProduct["kind"];
  indexType: IndexType;
}): ProductTypeStyle {
  return PRODUCT_TYPE_STYLES[badgeIdFor(product.kind, product.indexType)];
}

export function isIndexlaProduct(product: {
  creatorHandle: string;
  creatorName?: string;
}): boolean {
  return (
    product.creatorHandle.toLowerCase() === "indexla" ||
    (product.creatorName ?? "").toUpperCase() === "INDEXLA"
  );
}

export function splitMarketplaceByOrigin(products: MarketplaceProduct[]) {
  const indexla: MarketplaceProduct[] = [];
  const creator: MarketplaceProduct[] = [];
  for (const product of products) {
    if (isIndexlaProduct(product)) indexla.push(product);
    else creator.push(product);
  }
  return { indexla, creator };
}

/** Shared allocation segment colors — index-aligned with product list. */
export const ALLOCATION_SEGMENT_COLORS = [
  "#6366F1",
  "#3B82F6",
  "#06B6D4",
  "#10B981",
  "#F59E0B",
  "#EC4899",
  "#8B5CF6",
  "#14B8A6",
  "#F97316",
  "#64748B",
  "#0EA5E9",
  "#A855F7",
];

export function allocationSegmentColor(index: number): string {
  return ALLOCATION_SEGMENT_COLORS[index % ALLOCATION_SEGMENT_COLORS.length];
}
