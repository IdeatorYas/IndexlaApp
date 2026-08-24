import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DegenProductPageView } from "@/components/degen-club/DegenProductPageView";
import { LoadingSkeleton } from "@/components/states/AppStates";
import { getDegenProductById } from "@/lib/fixtures/degen-club";

export default async function DegenProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = getDegenProductById(id);
  if (!product) notFound();

  return (
    <Suspense fallback={<LoadingSkeleton title="Loading product" lines={6} />}>
      <DegenProductPageView product={product} />
    </Suspense>
  );
}
