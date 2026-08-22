import type { ReactNode } from "react";
import { IllustrativeBadge } from "@/components/ui/IllustrativeBadge";

export function SectionHeader({
  title,
  description,
  action,
  illustrative,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  illustrative?: boolean;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="app-display text-lg font-semibold text-app-ink md:text-xl">
            {title}
          </h2>
          {illustrative ? <IllustrativeBadge compact /> : null}
        </div>
        {description ? (
          <p className="mt-1 max-w-3xl text-sm text-app-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
