import {
  DegenAllocationDonut,
  type DegenDonutSegment,
} from "@/components/degen-club/DegenAllocationDonut";

export type DegenCardDonutSegment = DegenDonutSegment;

/** Marketplace card donut — 180px, asset count in center. */
export function DegenCardDonut({
  segments,
  size = 180,
}: {
  segments: DegenCardDonutSegment[];
  size?: number;
}) {
  return (
    <DegenAllocationDonut
      segments={segments}
      size={size}
      showCenterCount
    />
  );
}
