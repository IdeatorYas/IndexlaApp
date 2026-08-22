import { Suspense } from "react";
import { DiscoverView } from "@/components/discover/DiscoverView";
import { LoadingSkeleton } from "@/components/states/AppStates";
import { getDiscoverCatalog, isIllustrativeDataMode } from "@/lib/data";

export default function DiscoverPage() {
  const catalog = getDiscoverCatalog();
  const illustrative = isIllustrativeDataMode() || catalog.isIllustrative;

  return (
    <Suspense fallback={<LoadingSkeleton title="Loading Discover" lines={5} />}>
      <DiscoverView
        catalog={catalog.data}
        illustrative={illustrative}
        initialError={catalog.availability === "unavailable"}
      />
    </Suspense>
  );
}
