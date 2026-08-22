import { EmptyState } from "@/components/states/AppStates";
import { ScreenStub } from "@/components/screens/ScreenStub";
import { APP_SCREENS } from "@/lib/routes";

export default function LeaderboardPage() {
  return (
    <ScreenStub screen={APP_SCREENS[6]}>
      <EmptyState
        title="Monthly Portfolio Leaderboard"
        description="Top 10 winner zone, ranks 11–25 competing zone, and ranking formula stub. Likes and follows never affect score."
      />
    </ScreenStub>
  );
}
