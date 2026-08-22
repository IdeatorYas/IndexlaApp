import { Suspense } from "react";
import { CreateWizard } from "@/components/create/CreateWizard";
import { LoadingSkeleton } from "@/components/states/AppStates";

export default function CreatePortfolioPage() {
  return (
    <Suspense fallback={<LoadingSkeleton title="Loading create draft" lines={5} />}>
      <CreateWizard />
    </Suspense>
  );
}
