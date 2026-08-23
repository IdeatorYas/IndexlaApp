import { Suspense } from "react";
import { CreatorDashboardView } from "@/components/creators/CreatorDashboardView";
import { LoadingSkeleton } from "@/components/states/AppStates";
import {
  getCreatorDashboardWorkspace,
  isIllustrativeDataMode,
} from "@/lib/data";
import { getFeatureFlags } from "@/lib/feature-flags";

export default function CreatorDashboardPage() {
  const workspace = getCreatorDashboardWorkspace("indexla");
  const flags = getFeatureFlags();
  const illustrative =
    isIllustrativeDataMode() || workspace.data.isIllustrative;

  return (
    <Suspense
      fallback={
        <LoadingSkeleton title="Loading creator dashboard" lines={7} />
      }
    >
      <CreatorDashboardView
        workspace={workspace.data}
        illustrative={illustrative}
        featuredPlacementsEnabled={flags.FEATURED_PLACEMENTS_ENABLED}
        dexlaDemoMode={flags.DEXLA_DEMO_MODE}
        initialError={workspace.availability === "unavailable"}
      />
    </Suspense>
  );
}
