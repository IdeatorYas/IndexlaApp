import Link from "next/link";
import { EmptyState } from "@/components/states/AppStates";
import { APP_ROUTES } from "@/lib/routes";

export default function CreatorProfileNotFound() {
  return (
    <div className="mx-auto space-y-4 py-8" style={{ maxWidth: "var(--content-max)" }}>
      <EmptyState
        title="Creator not found"
        description="No public creator profile exists for this handle. Check the URL or browse the Creator Hub."
        action={
          <Link
            href={APP_ROUTES.creators}
            className="inline-flex h-10 items-center rounded-[10px] bg-app-brand px-4 text-sm font-bold text-white"
          >
            Browse Creators
          </Link>
        }
      />
    </div>
  );
}
