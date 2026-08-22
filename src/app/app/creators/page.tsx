import Link from "next/link";
import { EmptyState } from "@/components/states/AppStates";
import { ScreenStub } from "@/components/screens/ScreenStub";
import { ILLUSTRATIVE_CREATORS } from "@/lib/fixtures";
import { APP_ROUTES, APP_SCREENS } from "@/lib/routes";

export default function CreatorsPage() {
  return (
    <ScreenStub screen={APP_SCREENS[7]}>
      <EmptyState
        title="Creator Hub gateway"
        description="Browse creators, follow, and open activation or dashboard based on status."
      />
      <div className="flex flex-wrap gap-2">
        <Link
          href={APP_ROUTES.creatorLeaderboard}
          className="rounded-lg border border-app-line px-3 py-2 text-sm text-app-brand"
        >
          Creator Leaderboard →
        </Link>
        <Link
          href={APP_ROUTES.creatorActivate}
          className="rounded-lg border border-app-line px-3 py-2 text-sm text-app-brand"
        >
          Become a Creator →
        </Link>
        <Link
          href={APP_ROUTES.creatorDashboard}
          className="rounded-lg border border-app-line px-3 py-2 text-sm text-app-brand"
        >
          Creator Dashboard →
        </Link>
        <Link
          href={APP_ROUTES.creatorProfile(ILLUSTRATIVE_CREATORS[0]?.handle ?? "indexla")}
          className="rounded-lg border border-app-line px-3 py-2 text-sm text-app-brand"
        >
          Sample Profile →
        </Link>
      </div>
    </ScreenStub>
  );
}
