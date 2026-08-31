"use client";

import { OFFICIAL_STABLE_CLUB_BASE_POOLS } from "@/lib/stable-club/official-pools";
import {
  automationRequiresNftApproval,
  type NpmApprovalStatus,
} from "@/lib/stable-club/nft-approval";
import type { StableClubPosition } from "@/lib/stable-club/positions";
import type { HarvestUiStatus } from "@/lib/stable-club/harvest";
import type { CompoundUiStatus } from "@/lib/stable-club/compound";

export function StableClubPoolCatalogue({
  activatedPoolIds,
  testPoolValidated,
}: {
  activatedPoolIds: string[];
  testPoolValidated: boolean;
}) {
  return (
    <section className="app-panel rounded-[14px] border border-app-line p-4 sm:p-5">
      <h2 className="text-sm font-bold text-app-ink">Official Base pools (Step 2)</h2>
      <p className="mt-1 text-xs text-app-muted">
        Five approved pools. Activation requires internal test-pool validation.
        {" "}
        Test pool validated: {testPoolValidated ? "yes" : "pending"}
      </p>
      <ul className="mt-3 space-y-2">
        {OFFICIAL_STABLE_CLUB_BASE_POOLS.map((pool) => {
          const unavailable = pool.availability !== "available";
          const active = activatedPoolIds.includes(pool.id);
          const canActivate = testPoolValidated && !unavailable;
          return (
            <li
              key={pool.id}
              className="rounded-md border border-app-line bg-app-panel-soft px-3 py-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-app-ink">{pool.label}</p>
                  <p className="mt-0.5 text-[10px] text-app-dim">
                    {pool.protocol} · {pool.tokenA.symbol}/{pool.tokenB.symbol} · risk{" "}
                    {pool.riskLevel}
                  </p>
                  {unavailable ? (
                    <p className="mt-1 text-[10px] text-app-danger">
                      Unavailable — factory missing. Not launch-ready. No silent remap.
                    </p>
                  ) : null}
                </div>
                <span
                  className={
                    unavailable
                      ? "rounded border border-app-danger/30 bg-app-danger/10 px-2 py-0.5 text-[10px] font-bold uppercase text-app-danger"
                      : active
                        ? "rounded border border-app-success/30 bg-app-success/10 px-2 py-0.5 text-[10px] font-bold uppercase text-app-success"
                        : canActivate
                          ? "rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-600"
                          : "rounded border border-app-line px-2 py-0.5 text-[10px] font-bold uppercase text-app-dim"
                  }
                >
                  {unavailable
                    ? "Unavailable"
                    : active
                      ? "Activated"
                      : canActivate
                        ? "Ready"
                        : "Locked"}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function approvalBadge(status: NpmApprovalStatus) {
  if (status === "approved") {
    return (
      <span className="rounded border border-app-success/30 bg-app-success/10 px-2 py-0.5 text-[10px] font-bold uppercase text-app-success">
        NFT approved
      </span>
    );
  }
  if (status === "unavailable") {
    return (
      <span className="rounded border border-app-line px-2 py-0.5 text-[10px] font-bold uppercase text-app-dim">
        Approval N/A
      </span>
    );
  }
  return (
    <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-600">
      Approval required
    </span>
  );
}

export function StableClubPositionDashboard({
  positions,
  pendingProposals,
  circuitBroken,
  onApprovePosition,
  approvingPositionId,
  harvestOptInEnabled = false,
  harvestBusy = false,
  harvestUiStatus,
  onHarvestPosition,
  compoundOptInEnabled = false,
  compoundBusy = false,
  compoundUiStatus,
  compoundAutomationAvailable = false,
  compoundAutomationMessage,
  onCompoundPosition,
}: {
  positions: StableClubPosition[];
  pendingProposals: number;
  circuitBroken: boolean;
  onApprovePosition?: (position: StableClubPosition) => void;
  approvingPositionId?: string | null;
  harvestOptInEnabled?: boolean;
  harvestBusy?: boolean;
  harvestUiStatus?: HarvestUiStatus;
  onHarvestPosition?: (position: StableClubPosition) => void;
  compoundOptInEnabled?: boolean;
  compoundBusy?: boolean;
  compoundUiStatus?: CompoundUiStatus;
  compoundAutomationAvailable?: boolean;
  compoundAutomationMessage?: string;
  onCompoundPosition?: (position: StableClubPosition) => void;
}) {
  return (
    <section className="app-panel rounded-[14px] border border-app-line p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-app-ink">Position dashboard</h2>
        <div className="flex flex-wrap gap-2 text-[10px]">
          <span className="rounded border border-app-line px-2 py-0.5 text-app-dim">
            OpenServ proposals: {pendingProposals}
          </span>
          <span
            className={
              circuitBroken
                ? "rounded border border-app-danger/40 bg-app-danger/10 px-2 py-0.5 font-bold uppercase text-app-danger"
                : "rounded border border-app-success/30 bg-app-success/10 px-2 py-0.5 font-bold uppercase text-app-success"
            }
          >
            Circuit {circuitBroken ? "open" : "ok"}
          </span>
        </div>
      </div>
      <p className="mt-1 text-xs text-app-muted">
        On-chain ownership is authoritative. Harvest / compound / rebalance require a
        per-position ERC721 approve(adapter, tokenId) — never setApprovalForAll.
      </p>

      {positions.length === 0 ? (
        <p className="mt-4 text-xs text-app-dim">No positions yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {positions.map((pos) => {
            const needsApproval = automationRequiresNftApproval(pos.npmApprovalStatus);
            const canApprove =
              Boolean(onApprovePosition) &&
              Boolean(pos.npmAddress) &&
              Boolean(pos.adapterAddress) &&
              Boolean(pos.positionTokenId) &&
              /^\d+$/.test(pos.positionTokenId) &&
              needsApproval;
            const canHarvest =
              harvestOptInEnabled &&
              pos.dataVerifiedOnChain &&
              pos.npmApprovalStatus === "approved" &&
              Boolean(onHarvestPosition) &&
              Boolean(pos.adapterAddress) &&
              /^\d+$/.test(pos.positionTokenId) &&
              !pos.automation.paused;
            const canCompound =
              compoundOptInEnabled &&
              pos.dataVerifiedOnChain &&
              pos.npmApprovalStatus === "approved" &&
              Boolean(onCompoundPosition) &&
              Boolean(pos.adapterAddress) &&
              /^\d+$/.test(pos.positionTokenId) &&
              !pos.automation.paused;
            return (
              <li
                key={pos.id}
                className="rounded-md border border-app-line bg-app-panel-soft px-3 py-2"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-app-ink">{pos.poolLabel}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-app-dim">
                      NFT #{pos.positionTokenId} · {pos.tokenASymbol}/{pos.tokenBSymbol}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {approvalBadge(pos.npmApprovalStatus)}
                    <span className="rounded border border-app-line px-2 py-0.5 text-[10px] font-semibold uppercase text-app-dim">
                      {pos.rangeStatus}
                    </span>
                  </div>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                  <div>
                    <dt className="text-app-dim">Fees</dt>
                    <dd className="font-semibold text-app-ink">${pos.feesEarnedUsd}</dd>
                  </div>
                  <div>
                    <dt className="text-app-dim">Rewards</dt>
                    <dd className="font-semibold text-app-ink">${pos.rewardsEarnedUsd}</dd>
                  </div>
                  <div>
                    <dt className="text-app-dim">Automation</dt>
                    <dd className="font-semibold text-app-ink">
                      {[
                        pos.automation.harvest ? "H" : null,
                        pos.automation.compound ? "C" : null,
                        pos.automation.rebalance ? "R" : null,
                      ]
                        .filter(Boolean)
                        .join("") || "—"}
                      {pos.automation.paused ? " · paused" : ""}
                      {needsApproval ? " · blocked" : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-app-dim">Data</dt>
                    <dd className="font-semibold text-app-ink">
                      {pos.dataVerifiedOnChain
                        ? "On-chain verified"
                        : "Data Pending Verification"}
                    </dd>
                  </div>
                </dl>
                {needsApproval ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={!canApprove || approvingPositionId === pos.id}
                      onClick={() => onApprovePosition?.(pos)}
                      className="app-btn-primary h-8 px-3 text-[11px] font-bold disabled:opacity-50"
                    >
                      {approvingPositionId === pos.id
                        ? "Confirming approve…"
                        : "Approve NFT for adapter"}
                    </button>
                    <p className="text-[10px] text-app-dim">
                      Per-token only · spender = adapter · tokenId #{pos.positionTokenId}
                    </p>
                  </div>
                ) : null}
                {canHarvest ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={harvestBusy || harvestUiStatus?.status === "pending-receipt"}
                      onClick={() => onHarvestPosition?.(pos)}
                      className="app-btn-primary h-8 px-3 text-[11px] font-bold disabled:opacity-50"
                    >
                      {harvestBusy ? "Harvesting…" : "Manual harvest"}
                    </button>
                    {harvestUiStatus?.status === "confirmed" ? (
                      <span className="text-[10px] font-bold uppercase text-app-success">
                        Harvest confirmed
                      </span>
                    ) : harvestUiStatus?.status === "failed" ? (
                      <span className="text-[10px] text-app-danger">{harvestUiStatus.message}</span>
                    ) : null}
                  </div>
                ) : null}
                {canCompound ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={compoundBusy || compoundUiStatus?.status === "pending-receipt"}
                      onClick={() => onCompoundPosition?.(pos)}
                      className="app-btn-primary h-8 px-3 text-[11px] font-bold disabled:opacity-50"
                    >
                      {compoundBusy ? "Compounding…" : "Manual compound"}
                    </button>
                    {compoundUiStatus?.status === "confirmed" ? (
                      <span className="text-[10px] font-bold uppercase text-app-success">
                        Compound confirmed
                      </span>
                    ) : compoundUiStatus?.status === "failed" ? (
                      <span className="text-[10px] text-app-danger">{compoundUiStatus.message}</span>
                    ) : null}
                    {!compoundAutomationAvailable ? (
                      <span className="text-[10px] text-app-dim">
                        {compoundAutomationMessage ??
                          "Automation unavailable until OpenServ publisher/keeper is connected"}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
