import { Suspense } from "react";
import { StrategiesView } from "@/components/strategies/StrategiesView";
import { LoadingSkeleton } from "@/components/states/AppStates";
import { getStrategiesWorkspace, isIllustrativeDataMode } from "@/lib/data";

export default function StrategiesPage() {
  const workspace = getStrategiesWorkspace();
  const illustrative = isIllustrativeDataMode() || workspace.isIllustrative;

  return (
    <Suspense fallback={<LoadingSkeleton title="Loading Strategies" lines={6} />}>
      <StrategiesView
        workspace={workspace.data}
        illustrative={illustrative}
        initialError={workspace.availability === "unavailable"}
      />
    </Suspense>
  );
}
