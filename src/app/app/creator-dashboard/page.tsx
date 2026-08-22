import { EmptyState, UtilityGateState } from "@/components/states/AppStates";
import { ScreenStub } from "@/components/screens/ScreenStub";
import { getFeatureFlags } from "@/lib/feature-flags";
import { APP_SCREENS } from "@/lib/routes";

export default function CreatorDashboardPage() {
  const flags = getFeatureFlags();
  return (
    <ScreenStub screen={APP_SCREENS[11]}>
      <EmptyState
        title="Creator business dashboard"
        description="Earnings overview, live portfolios, audience metrics and strategy revenue stub."
      />
      <UtilityGateState
        featureName="Feature Portfolio Placement"
        demoMode={flags.DEXLA_DEMO_MODE}
      />
    </ScreenStub>
  );
}
