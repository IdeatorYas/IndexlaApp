import Link from "next/link";
import { APP_ROUTES } from "@/lib/routes";

export default function DegenProductNotFound() {
  return (
    <div className="degen-detail-section space-y-3 text-center">
      <h1 className="degen-section-title">Product not found</h1>
      <p className="text-sm text-[var(--degen-muted)]">
        This memecoin index or portfolio is not in the Degen Club catalog.
      </p>
      <Link href={APP_ROUTES.degenClub} className="degen-btn-primary inline-flex h-10 px-4">
        Back to Degen Club
      </Link>
    </div>
  );
}
