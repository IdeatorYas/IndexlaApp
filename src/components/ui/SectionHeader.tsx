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
    <div className="mb-2.5 flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="app-display text-[16px] font-bold text-app-ink">
            {title}
          </h2>
          {illustrative ? <IllustrativeBadge compact /> : null}
        </div>
        {description ? (
          <p className="mt-0.5 max-w-3xl text-[12px] text-app-muted">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
