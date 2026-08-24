import {
  EmbeddedAllocationDonut,
  toEmbeddedDonutSegments,
} from "@/components/ui/EmbeddedAllocationDonut";

export type AllocationDonutSegment = {
  label: string;
  percent: number;
  assetId?: string;
  assetKey?: string;
  imageUrl?: string | null;
};

/** Compact or card-sized allocation donut — brand segments with embedded logos. */
export function AllocationDonut({
  segments,
  size = 56,
}: {
  segments: AllocationDonutSegment[];
  size?: number;
}) {
  return (
    <EmbeddedAllocationDonut
      segments={toEmbeddedDonutSegments(segments)}
      size={size}
      showCenterLabels={size >= 56}
      centerSubLabel="100%"
    />
  );
}
