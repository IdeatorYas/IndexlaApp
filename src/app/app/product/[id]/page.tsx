import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ProductPageView } from "@/components/product/ProductPageView";
import { LoadingSkeleton } from "@/components/states/AppStates";
import { getMarketplaceProductById } from "@/lib/data";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = getMarketplaceProductById(id);
  const product = result.data;

  if (!product) notFound();

  return (
    <Suspense fallback={<LoadingSkeleton title="Loading product" lines={6} />}>
      <ProductPageView product={product} />
    </Suspense>
  );
}
