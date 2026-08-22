import { EmptyState } from "@/components/states/AppStates";
import { ScreenStub } from "@/components/screens/ScreenStub";
import { APP_SCREENS } from "@/lib/routes";

export default function CreatorLeaderboardPage() {
  return (
    <ScreenStub screen={APP_SCREENS[8]}>
      <EmptyState
        title="Creator discovery leaderboard"
        description="Ranks creator profiles separately from portfolio monthly rewards. Never reuse portfolio reward eligibility here."
      />
    </ScreenStub>
  );
}
