import Link from "next/link";
import type { Portfolio } from "@/lib/domain/types";
import { PortfolioCard } from "@/components/portfolio/PortfolioCard";
import { EmptyState } from "@/components/states/AppStates";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { APP_ROUTES } from "@/lib/routes";

export function ActivePortfoliosSection({
  portfolios,
}: {
  portfolios: Portfolio[];
}) {
  return (
    <section>
      <SectionHeader
        title="Active Portfolios"
        description="Your latest portfolio activity at a glance."
        illustrative={portfolios.some((p) => p.isIllustrative)}
        action={
          <Link
            href={APP_ROUTES.portfolio}
            className="text-sm font-medium text-app-brand hover:underline"
          >
            View All Portfolios →
          </Link>
        }
      />

      {portfolios.length === 0 ? (
        <EmptyState
          title="No active portfolios"
          description="Create or invest in a portfolio to see it here."
          action={
            <Link
              href={APP_ROUTES.create}
              className="rounded-lg bg-app-brand px-4 py-2 text-sm font-medium text-white"
            >
              Create Portfolio
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {portfolios.map((portfolio) => (
            <PortfolioCard key={portfolio.id} portfolio={portfolio} />
          ))}
        </div>
      )}
    </section>
  );
}
