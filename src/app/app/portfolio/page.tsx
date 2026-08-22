import { Suspense } from "react";
import { MyPortfolioView } from "@/components/portfolio/MyPortfolioView";
import { LoadingSkeleton } from "@/components/states/AppStates";
import { getMyPortfolioWorkspace, isIllustrativeDataMode } from "@/lib/data";

export default function MyPortfolioPage() {
  const workspace = getMyPortfolioWorkspace();
  const illustrative = isIllustrativeDataMode() || workspace.isIllustrative;

  return (
    <Suspense fallback={<LoadingSkeleton title="Loading My Portfolio" lines={6} />}>
      <MyPortfolioView
        workspace={workspace.data}
        illustrative={illustrative}
        initialError={workspace.availability === "unavailable"}
      />
    </Suspense>
  );
}
