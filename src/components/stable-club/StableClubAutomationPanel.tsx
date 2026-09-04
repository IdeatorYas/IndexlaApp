"use client";

/**
 * Product-facing automation surface for Base Five-Pool Beta.
 * Reuses audited harvest/compound hooks. Never bypasses launch policy,
 * permissions, OpenServ keeper gates, or missing deployments.
 */
import { useStableClubCompound } from "@/components/stable-club/useStableClubCompound";
import { useStableClubHarvest } from "@/components/stable-club/useStableClubHarvest";
import { COMPOUND_OPENSERV_CONNECTED } from "@/lib/stable-club/compound-validation";
import {
  isLaunchAutomationEnabledForEnvironment,
  launchAutomationDisabledReason,
} from "@/lib/stable-club/local-automation-policy";
import { PRIVATE_BETA_LAUNCH_PARAMS } from "@/lib/stable-club/launch-params";
import { describeLaunchAutomationPublicStatus } from "@/lib/stable-club/pool-launch-status";

export function StableClubAutomationPanel() {
  const harvest = useStableClubHarvest();
  const compound = useStableClubCompound();

  const harvestPolicyOn = isLaunchAutomationEnabledForEnvironment(
    "harvest",
    harvest.deployments ?? null,
  );
  const compoundPolicyOn = isLaunchAutomationEnabledForEnvironment(
    "compound",
    compound.deployments ?? null,
  );

  const harvestOptInDisabled =
    harvest.busy || harvest.permissionRegistered || !harvestPolicyOn || !harvest.deployments;
  const compoundOptInDisabled =
    compound.busy ||
    compound.permissionRegistered ||
    !compoundPolicyOn ||
    !compound.deployments;

  const harvestManualDisabled =
    harvest.busy || !harvest.permissionRegistered || !harvestPolicyOn || !harvest.deployments;
  const compoundManualDisabled =
    compound.busy ||
    !compound.permissionRegistered ||
    !compoundPolicyOn ||
    !compound.deployments ||
    !COMPOUND_OPENSERV_CONNECTED;

  const publicStatus = describeLaunchAutomationPublicStatus(PRIVATE_BETA_LAUNCH_PARAMS);

  return (
    <section
      className="stable-club-strategy-box mt-8"
      data-automation-panel="base-beta"
      aria-label="Stable Club auto-harvest and auto-compound"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-300">
            Auto-Harvest · Auto-Compound
          </p>
          <h2 className="app-display mt-2 text-xl font-bold text-app-ink sm:text-2xl">
            Base strategy automation
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-app-muted">
            INDEXLA uses the audited harvest and compound permission paths. Opt-in, limits, expiry,
            revocation and circuit breakers remain enforced. Unattended keeper execution requires
            OpenServ connectivity and Stage policy enablement.
          </p>
        </div>
      </header>

      <ul className="mt-4 space-y-1.5 text-[12px] text-app-dim">
        {publicStatus.map((row) => (
          <li key={row.kind}>
            <span className="font-semibold capitalize text-app-ink">{row.kind}:</span>{" "}
            {row.publicLabel}
          </li>
        ))}
        <li>
          <span className="font-semibold text-app-ink">OpenServ keeper:</span>{" "}
          {COMPOUND_OPENSERV_CONNECTED
            ? "Connected"
            : (compound.automationStatusMessage ?? "Not connected")}
        </li>
        {!harvestPolicyOn ? (
          <li>{launchAutomationDisabledReason("harvest")}</li>
        ) : null}
        {!compoundPolicyOn ? (
          <li>{launchAutomationDisabledReason("compound")}</li>
        ) : null}
      </ul>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={harvestOptInDisabled}
          onClick={() => void harvest.registerHarvestPermission()}
          className="app-btn-secondary h-11 rounded-[12px] px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
        >
          Opt in Auto-Harvest
        </button>
        <button
          type="button"
          disabled={compoundOptInDisabled}
          onClick={() => void compound.registerCompoundPermission()}
          className="app-btn-secondary h-11 rounded-[12px] px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
        >
          Opt in Auto-Compound
        </button>
        <button
          type="button"
          disabled={harvestManualDisabled}
          onClick={() => {
            /* Manual fallback requires a verified on-chain position — gated until deployments + policy allow. */
          }}
          className="app-btn-secondary h-11 rounded-[12px] px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
        >
          Manual harvest fallback
        </button>
        <button
          type="button"
          disabled={compoundManualDisabled}
          onClick={() => {
            /* Manual fallback requires a verified on-chain position — gated until deployments + policy allow. */
          }}
          className="app-btn-secondary h-11 rounded-[12px] px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
        >
          Manual compound fallback
        </button>
      </div>

      {harvest.uiStatus.message ? (
        <p className="mt-3 text-[11px] text-app-muted">{harvest.uiStatus.message}</p>
      ) : null}
      {compound.uiStatus.message ? (
        <p className="mt-2 text-[11px] text-app-muted">{compound.uiStatus.message}</p>
      ) : null}
    </section>
  );
}
