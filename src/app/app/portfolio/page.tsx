import { DisconnectedWalletState, EmptyState } from "@/components/states/AppStates";
import { ScreenStub } from "@/components/screens/ScreenStub";
import { APP_SCREENS } from "@/lib/routes";

export default function MyPortfolioPage() {
  return (
    <ScreenStub screen={APP_SCREENS[4]}>
      <DisconnectedWalletState />
      <EmptyState
        title="Overview · Assets · Automation · Activity · Notifications"
        description="Tabbed portfolio center stub with Save tier and investor rewards cards."
      />
    </ScreenStub>
  );
}
