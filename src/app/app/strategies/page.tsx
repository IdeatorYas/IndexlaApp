import { EmptyState, UtilityGateState } from "@/components/states/AppStates";
import { ScreenStub } from "@/components/screens/ScreenStub";
import { getFeatureFlags } from "@/lib/feature-flags";
import { APP_SCREENS } from "@/lib/routes";

export default function StrategiesPage() {
  const flags = getFeatureFlags();
  return (
    <ScreenStub screen={APP_SCREENS[5]}>
      <EmptyState
        title="Marketplace · My Strategies · Publish Strategy"
        description="Strategy marketplace tabs and cards stub."
      />
      <UtilityGateState
        featureName="Private Strategy Payments"
        demoMode={flags.DEXLA_DEMO_MODE}
      />
    </ScreenStub>
  );
}
