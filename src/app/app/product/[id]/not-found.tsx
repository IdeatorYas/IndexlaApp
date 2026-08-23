import Link from "next/link";
import { APP_ROUTES } from "@/lib/routes";

export default function ProductNotFound() {
  return (
    <div className="app-panel mx-auto max-w-md p-6 text-center">
      <h1 className="app-display text-xl font-bold text-app-ink">
        Product not found
      </h1>
      <p className="mt-2 text-sm text-app-muted">
        This index or portfolio is not in the current catalog preview.
      </p>
      <Link
        href={APP_ROUTES.discover}
        className="app-gradient-btn mt-4 inline-flex h-10 items-center rounded-[10px] px-4 text-sm font-bold"
      >
        Back to Discover
      </Link>
    </div>
  );
}
