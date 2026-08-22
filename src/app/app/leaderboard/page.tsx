import { Suspense } from "react";
import { LeaderboardView } from "@/components/leaderboard/LeaderboardView";
import { LoadingSkeleton } from "@/components/states/AppStates";
import {
  getLeaderboardWorkspace,
  isIllustrativeDataMode,
} from "@/lib/data";

export default function LeaderboardPage() {
  const workspace = getLeaderboardWorkspace();
  const illustrative = isIllustrativeDataMode() || workspace.isIllustrative;

  return (
    <Suspense
      fallback={<LoadingSkeleton title="Loading Portfolio Leaderboard" lines={6} />}
    >
      <LeaderboardView
        workspace={workspace.data}
        illustrative={illustrative}
        initialError={workspace.availability === "unavailable"}
      />
    </Suspense>
  );
}
