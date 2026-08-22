import { EmptyState } from "@/components/states/AppStates";
import { ScreenStub } from "@/components/screens/ScreenStub";
import { APP_SCREENS } from "@/lib/routes";

export default function DiscoverPage() {
  return (
    <ScreenStub screen={APP_SCREENS[1]}>
      <EmptyState
        title="All · Indexes · Portfolios"
        description="Discovery tabs, filters and product grid will render here in Phase 2."
      />
    </ScreenStub>
  );
}
