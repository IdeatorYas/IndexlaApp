import { Suspense } from "react";
import { CreatorsHubView } from "@/components/creators/CreatorsHubView";
import { LoadingSkeleton } from "@/components/states/AppStates";
import { getCreatorsWorkspace, isIllustrativeDataMode } from "@/lib/data";

export default function CreatorsPage() {
  const workspace = getCreatorsWorkspace();
  const illustrative = isIllustrativeDataMode() || workspace.isIllustrative;

  return (
    <Suspense fallback={<LoadingSkeleton title="Loading Creator Hub" lines={6} />}>
      <CreatorsHubView
        workspace={workspace.data}
        illustrative={illustrative}
        initialError={workspace.availability === "unavailable"}
      />
    </Suspense>
  );
}
