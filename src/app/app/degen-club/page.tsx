import { EmptyState, UnavailableState } from "@/components/states/AppStates";
import { ScreenStub } from "@/components/screens/ScreenStub";
import { APP_SCREENS } from "@/lib/routes";

export default function DegenClubPage() {
  return (
    <ScreenStub screen={APP_SCREENS[2]}>
      <UnavailableState
        title="EXTREME RISK — persistent warning"
        description="Memecoins are highly speculative and may lose most or all of their value. Diversification does not remove risk. This banner remains non-dismissible on every Degen Club view."
      />
      <EmptyState
        title="10 Shots > 1 Shot"
        description="Memecoin index grid and build flow stub. All performance figures remain Illustrative until live verified data exists."
      />
    </ScreenStub>
  );
}
