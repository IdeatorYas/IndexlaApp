import Link from "next/link";
import type { NotificationPreviewItem } from "@/lib/domain/dashboard";
import { EmptyState } from "@/components/states/AppStates";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { formatRelativeTime } from "@/lib/dashboard/data";
import { APP_ROUTES } from "@/lib/routes";

export function NotificationsPreviewSection({
  items,
}: {
  items: NotificationPreviewItem[];
}) {
  return (
    <section className="app-panel p-5 md:p-6">
      <SectionHeader
        title="Notifications"
        action={
          <Link
            href={`${APP_ROUTES.portfolio}?tab=notifications`}
            className="text-sm font-semibold text-app-brand hover:underline"
          >
            View all →
          </Link>
        }
      />
      {items.length === 0 ? (
        <EmptyState
          title="No notifications"
          description="Automation, permission and reward alerts will appear here."
        />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex gap-3 rounded-xl border border-app-line bg-app-panel/50 p-3"
            >
              <span
                className={[
                  "mt-1 h-2.5 w-2.5 shrink-0 rounded-full",
                  item.unread ? "bg-app-brand" : "bg-app-dim/40",
                ].join(" ")}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-app-ink">{item.title}</p>
                <p className="mt-0.5 text-sm text-app-muted">{item.body}</p>
                <p className="mt-1 text-[11px] text-app-dim">
                  {formatRelativeTime(item.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
