import { EmptyState } from "@/components/states/AppStates";
import { ScreenStub } from "@/components/screens/ScreenStub";
import { APP_SCREENS } from "@/lib/routes";

export default function CreatorActivatePage() {
  return (
    <ScreenStub screen={APP_SCREENS[10]}>
      <EmptyState
        title="Creator activation sequence"
        description="Publish public portfolio → connect social → submit verification → approved dashboard access."
      />
    </ScreenStub>
  );
}
