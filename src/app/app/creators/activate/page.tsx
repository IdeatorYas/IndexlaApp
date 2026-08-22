import { Suspense } from "react";
import { CreatorActivationView } from "@/components/creators/CreatorActivationView";
import { LoadingSkeleton } from "@/components/states/AppStates";
import {
  getMyPortfolioWorkspace,
  isIllustrativeDataMode,
} from "@/lib/data";

export default function CreatorActivatePage() {
  const workspace = getMyPortfolioWorkspace();
  const illustrative =
    isIllustrativeDataMode() || workspace.data.isIllustrative;

  return (
    <Suspense
      fallback={
        <LoadingSkeleton title="Loading creator activation" lines={6} />
      }
    >
      <CreatorActivationView
        portfolios={workspace.data.portfolios}
        illustrative={illustrative}
        initialError={workspace.availability === "unavailable"}
      />
    </Suspense>
  );
}
