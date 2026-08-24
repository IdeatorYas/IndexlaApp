"use client";

import {
  EmbeddedAllocationDonut,
  type EmbeddedDonutSegment,
} from "@/components/ui/EmbeddedAllocationDonut";

export type CreateDonutSegment = {
  /** Registry / logo key (prefer ticker symbol). */
  assetKey: string;
  label: string;
  percent: number;
  imageUrl?: string | null;
};

/** Create flow allocation donut — matches portfolio / product detail styling. */
export function CreateAllocationDonut({
  segments,
  size = 320,
  totalPercent,
}: {
  segments: CreateDonutSegment[];
  size?: number;
  /** Live allocation total (0–100+). Center copy reflects exactness. */
  totalPercent: number;
  compact?: boolean;
}) {
  const exact = Math.abs(totalPercent - 100) < 0.005;
  const centerSubLabel = exact
    ? "100% Allocated"
    : `${totalPercent.toFixed(1)}% Total`;

  if (segments.length === 0) {
    return (
      <div
        className="relative mx-auto flex aspect-square w-full max-w-[min(100%,360px)] items-center justify-center rounded-full border border-dashed border-app-line/70 bg-app-elevated/60"
        style={{ width: size, height: size, maxWidth: "100%" }}
      >
        <div className="px-6 text-center">
          <p className="app-display text-sm font-bold text-app-ink">
            Allocation
          </p>
          <p className="mt-1 text-[11px] text-app-dim">
            Select assets to build the chart
          </p>
        </div>
      </div>
    );
  }

  const embedded: EmbeddedDonutSegment[] = segments.map((seg) => ({
    assetKey: seg.assetKey,
    label: seg.label,
    percent: seg.percent,
    imageUrl: seg.imageUrl,
  }));

  return (
    <div className="relative mx-auto w-full max-w-[min(100%,400px)]">
      <div className="pointer-events-none absolute inset-[10%] rounded-full bg-[radial-gradient(circle_at_50%_42%,color-mix(in_srgb,var(--color-ink)_6%,transparent),transparent_70%)]" />
      <EmbeddedAllocationDonut
        segments={embedded}
        size={size}
        centerSubLabel={centerSubLabel}
        showCenterLabels
        className="relative mx-auto"
      />
    </div>
  );
}
