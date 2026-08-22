import type { Portfolio } from "@/lib/domain/types";
import { getDashboard, getPortfolioById } from "@/lib/data";

export function getActivePortfolios(ids: string[]): Portfolio[] {
  return ids
    .map((id) => getPortfolioById(id).data)
    .filter((p): p is Portfolio => Boolean(p))
    .slice(0, 3);
}

/** @deprecated Prefer getDashboard() from @/lib/data */
export function getDashboardFixture() {
  return getDashboard().data;
}

export function formatUsd(value: number, compact = false): string {
  if (compact && Math.abs(value) >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (compact && Math.abs(value) >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatUsdSigned(value: number): string {
  const prefix = value >= 0 ? "+" : "";
  return `${prefix}${formatUsd(value)}`;
}

export function formatPercent(value: number, signed = false): string {
  const prefix = signed && value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)}%`;
}

/** $DEXLA amounts are never combined with USD totals */
export function formatDexla(value: number): string {
  return `${value.toLocaleString("en-US")} $DEXLA`;
}

export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatMarketTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
