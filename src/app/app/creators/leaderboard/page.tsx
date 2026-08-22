import { Suspense } from "react";
import { CreatorLeaderboardView } from "@/components/creators/CreatorLeaderboardView";
import { LoadingSkeleton } from "@/components/states/AppStates";
import { getCreatorsWorkspace, isIllustrativeDataMode } from "@/lib/data";

export default function CreatorLeaderboardPage() {
  const workspace = getCreatorsWorkspace();
  const illustrative = isIllustrativeDataMode() || workspace.isIllustrative;

  return (
    <Suspense
      fallback={<LoadingSkeleton title="Loading Creator Leaderboard" lines={6} />}
    >
      <CreatorLeaderboardView
        workspace={workspace.data}
        illustrative={illustrative}
        initialError={workspace.availability === "unavailable"}
      />
    </Suspense>
  );
}
