import {
  DegenAllocationDonut,
  type DegenDonutSegment,
} from "@/components/degen-club/DegenAllocationDonut";

export type DegenCardDonutSegment = DegenDonutSegment;

/** Marketplace card donut — brand segments + embedded logos, Assets/100% center. */
export function DegenCardDonut({
  segments,
  size = 188,
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
