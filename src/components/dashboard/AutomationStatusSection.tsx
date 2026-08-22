import Link from "next/link";
import type { DashboardAutomationSummary } from "@/lib/domain/dashboard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { APP_ROUTES } from "@/lib/routes";

const HEALTH = {
  healthy: "bg-app-success/15 text-app-success",
  expiring: "bg-app-warning/15 text-app-warning",
  degraded: "bg-app-danger/15 text-app-danger",
} as const;

export function AutomationStatusSection({
  automation,
}: {
  automation: DashboardAutomationSummary;
}) {
  return (
    <section className="app-panel h-full p-5 md:p-6">
      <SectionHeader
        title="Automation Status"
        illustrative={automation.isIllustrative}
        action={
          <Link
            href={`${APP_ROUTES.portfolio}?tab=automation`}
            className="text-sm font-semibold text-app-brand hover:underline"
          >
            Manage →
          </Link>
        }
      />

      <div className="space-y-3">
        <Row label="Active rules" value={String(automation.activeRules)} />
        <Row label="Next scheduled action" value={automation.nextScheduledAction} />
        <div className="app-panel-soft p-3.5">
          <p className="text-xs text-app-dim">Permission health</p>
          <p
            className={[
              "mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-bold",
              HEALTH[automation.permissionHealth],
            ].join(" ")}
          >
            {automation.permissionHealthLabel}
          </p>
        </div>
        <Row label="Last execution" value={automation.lastExecution} />
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="app-panel-soft p-3.5">
      <p className="text-xs text-app-dim">{label}</p>
      <p className="mt-1 text-sm font-semibold text-app-ink">{value}</p>
    </div>
  );
}
