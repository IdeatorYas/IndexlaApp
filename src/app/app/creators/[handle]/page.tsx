import { notFound } from "next/navigation";
import { EmptyState } from "@/components/states/AppStates";
import { ScreenStub } from "@/components/screens/ScreenStub";
import { getCreatorByHandle } from "@/lib/fixtures";
import { APP_SCREENS } from "@/lib/routes";

export default async function CreatorProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const creator = getCreatorByHandle(handle);
  if (!creator) {
    notFound();
  }

  const screen = {
    ...APP_SCREENS[9],
    route: `/app/creators/${handle}`,
  };

  return (
    <ScreenStub screen={screen}>
      <EmptyState
        title={creator.displayName}
        description={`@${creator.handle} · ${creator.publicPortfolioCount} public portfolios · ${creator.followerCount.toLocaleString()} followers · Illustrative profile.`}
      />
    </ScreenStub>
  );
}
