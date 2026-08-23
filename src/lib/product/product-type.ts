import type { CSSProperties } from "react";

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

  /** Badge / accent anchor (saturated category hue) */

  fill: string;

  /** High-contrast text on solid type badges */

  textOnFill: string;

}



const PRODUCT_TYPE_STYLES: Record<ProductTypeBadgeId, ProductTypeStyle> = {

  "crypto-index": {

    id: "crypto-index",

    label: "Crypto Index",

    color: "#F59E0B",

    glow: "rgba(245,158,11,0.42)",

    border: "rgba(217,119,6,0.55)",

    surface: "rgba(245,158,11,0.12)",

    fill: "#D97706",

    textOnFill: "#FFFFFF",

  },

  "stock-index": {

    id: "stock-index",

    label: "Stock Index",

    color: "#0EA5E9",

    glow: "rgba(14,165,233,0.42)",

    border: "rgba(2,132,199,0.55)",

    surface: "rgba(14,165,233,0.12)",

    fill: "#0284C7",

    textOnFill: "#FFFFFF",

  },

  "commodities-index": {

    id: "commodities-index",

    label: "Commodities Index",

    color: "#CD7F32",

    glow: "rgba(205,127,50,0.42)",

    border: "rgba(161,98,7,0.55)",

    surface: "rgba(205,127,50,0.12)",

    fill: "#A16207",

    textOnFill: "#FFFFFF",

  },

  "hybrid-index": {

    id: "hybrid-index",

    label: "Hybrid Index",

    color: "#8B5CF6",

    glow: "rgba(139,92,246,0.42)",

    border: "rgba(124,58,237,0.55)",

    surface: "rgba(139,92,246,0.12)",

    fill: "#7C3AED",

    textOnFill: "#FFFFFF",

  },

  "crypto-portfolio": {

    id: "crypto-portfolio",

    label: "Crypto Portfolio",

    color: "#F97316",

    glow: "rgba(249,115,22,0.42)",

    border: "rgba(234,88,12,0.55)",

    surface: "rgba(249,115,22,0.12)",

    fill: "#EA580C",

    textOnFill: "#FFFFFF",

  },

  "stock-portfolio": {

    id: "stock-portfolio",

    label: "Stock Portfolio",

    color: "#2563EB",

    glow: "rgba(0,71,171,0.42)",

    border: "rgba(0,71,171,0.55)",

    surface: "rgba(0,71,171,0.12)",

    fill: "#0047AB",

    textOnFill: "#FFFFFF",

  },

  "commodities-portfolio": {

    id: "commodities-portfolio",

    label: "Commodities Portfolio",

    color: "#EAB308",

    glow: "rgba(234,179,8,0.42)",

    border: "rgba(202,138,4,0.55)",

    surface: "rgba(234,179,8,0.12)",

    fill: "#CA8A04",

    textOnFill: "#FFFFFF",

  },

  "hybrid-portfolio": {

    id: "hybrid-portfolio",

    label: "Hybrid Portfolio",

    color: "#EC4899",

    glow: "rgba(236,72,153,0.42)",

    border: "rgba(219,39,119,0.55)",

    surface: "rgba(236,72,153,0.12)",

    fill: "#DB2777",

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

  "#D97706",

  "#0284C7",

  "#A16207",

  "#7C3AED",

  "#EA580C",

  "#0047AB",

  "#CA8A04",

  "#DB2777",

  "#64748B",

  "#F59E0B",

  "#2563EB",

  "#CD7F32",

];



export function allocationSegmentColor(index: number): string {

  return ALLOCATION_SEGMENT_COLORS[index % ALLOCATION_SEGMENT_COLORS.length];

}



export const PRODUCT_NAME_BOX_CLASS = "app-product-name-box";



/** ~50% lighter tinted name box — borders, category text and glow carry the hue. */

export function productNameBoxStyle(typeStyle: ProductTypeStyle): CSSProperties {

  return {

    borderColor: typeStyle.border,

    boxShadow: `0 0 22px -10px ${typeStyle.glow}, inset 0 1px 0 rgba(255,255,255,0.14)`,

    ["--pt-accent" as string]: typeStyle.color,

    ["--pt-fill" as string]: typeStyle.fill,

  } as CSSProperties;

}


