import { EmptyState } from "@/components/states/AppStates";
import { ScreenStub } from "@/components/screens/ScreenStub";
import { APP_SCREENS } from "@/lib/routes";

export default function CreatePortfolioPage() {
  return (
    <ScreenStub screen={APP_SCREENS[3]}>
      <EmptyState
        title="8-step builder stub"
        description="Choose product type → assets → allocations → strategy → rules → visibility → review → authorize. Wizard UI arrives in Phase 2."
      />
    </ScreenStub>
  );
}
