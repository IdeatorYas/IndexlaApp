import { Suspense } from "react";
import { notFound } from "next/navigation";
import { CreatorProfileView } from "@/components/creators/CreatorProfileView";
import { LoadingSkeleton } from "@/components/states/AppStates";
import {
  getCreatorPublicHandles,
  getCreatorPublicProfile,
  isIllustrativeDataMode,
} from "@/lib/data";

export function generateStaticParams() {
  return getCreatorPublicHandles().data.map((handle) => ({ handle }));
}

export default async function CreatorProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const result = getCreatorPublicProfile(handle);
  const profile = result.data;

  if (!profile) {
    notFound();
  }

  const illustrative = isIllustrativeDataMode() || profile.isIllustrative;

  return (
    <Suspense
      fallback={<LoadingSkeleton title="Loading creator profile" lines={6} />}
    >
      <CreatorProfileView
        profile={profile}
        illustrative={illustrative}
        initialError={result.availability === "unavailable"}
      />
    </Suspense>
  );
}
