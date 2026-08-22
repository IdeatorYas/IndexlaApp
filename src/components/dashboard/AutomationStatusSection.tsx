import Link from "next/link";
import type { DashboardAutomationSummary } from "@/lib/domain/dashboard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { APP_ROUTES } from "@/lib/routes";

const HEALTH_STYLES = {
  healthy: "text-app-success bg-app-success/10",
  expiring: "text-app-warning bg-app-warning/10",
  degraded: "text-app-danger bg-app-danger/10",
} as const;

export function AutomationStatusSection({
  automation,
}: {
  automation: DashboardAutomationSummary;
}) {
  return (
    <section className="app-panel p-5 md:p-6">
      <SectionHeader
        title="Automation Status"
        illustrative={automation.isIllustrative}
        action={
          <Link
            href={`${APP_ROUTES.portfolio}?tab=automation`}
            className="text-sm font-medium text-app-brand hover:underline"
          >
            Manage Automations →
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Stat label="Active rules" value={String(automation.activeRules)} />
        <Stat label="Next scheduled action" value={automation.nextScheduledAction} />
        <div className="rounded-lg border border-app-line bg-app-panel/50 p-3 sm:col-span-2">
          <p className="text-xs text-app-dim">Permission health</p>
          <p
            className={[
              "mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
              HEALTH_STYLES[automation.permissionHealth],
            ].join(" ")}
          >
            {automation.permissionHealthLabel}
          </p>
        </div>
        <Stat
          label="Last execution"
          value={automation.lastExecution}
          className="sm:col-span-2"
        />
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div
      className={[
        "rounded-lg border border-app-line bg-app-panel/50 p-3",
        className,
      ].join(" ")}
    >
      <p className="text-xs text-app-dim">{label}</p>
      <p className="mt-1 text-sm font-medium text-app-ink">{value}</p>
    </div>
  );
}
