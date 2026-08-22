import { Suspense } from "react";
import { DegenClubView } from "@/components/degen-club/DegenClubView";
import { LoadingSkeleton } from "@/components/states/AppStates";
import { getDegenClubWorkspace, isIllustrativeDataMode } from "@/lib/data";

export default function DegenClubPage() {
  const workspace = getDegenClubWorkspace();
  const illustrative = isIllustrativeDataMode() || workspace.isIllustrative;

  return (
    <Suspense fallback={<LoadingSkeleton title="Loading Degen Club" lines={6} />}>
      <DegenClubView
        workspace={workspace.data}
        illustrative={illustrative}
        initialError={workspace.availability === "unavailable"}
      />
    </Suspense>
  );
}
