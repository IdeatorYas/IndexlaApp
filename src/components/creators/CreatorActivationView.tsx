"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { OwnedPortfolioSummary } from "@/lib/domain/my-portfolio";
import {
  ACTIVATION_SPECIALTIES,
  CREATOR_ACTIVATION_REQUIREMENT_COPY,
  canSubmitVerification,
  hasConnectedSocial,
  hasSelectedPublicPortfolio,
  previewSocialHandle,
  statusLabel,
  type ActivationSocialPlatform,
  type ActivationWizardStep,
  type CreatorActivationStatus,
} from "@/lib/domain/creator-activation";
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
} from "@/components/states/AppStates";
import { useDemoWallet } from "@/components/wallet/DemoWalletProvider";
import { formatPercent, formatUsd } from "@/lib/dashboard/data";
import { APP_ROUTES } from "@/lib/routes";
import { useCreatorActivation } from "@/components/creators/useCreatorActivation";

type ViewState = "loading" | "ready" | "error";

const STEPS: { id: ActivationWizardStep; label: string; number: number }[] = [
  { id: "portfolio", label: "Publish a Public Portfolio", number: 1 },
  { id: "social", label: "Connect Social Media", number: 2 },
  { id: "verification", label: "Verification", number: 3 },
  { id: "approved", label: "Creator Access Approved", number: 4 },
];

export function CreatorActivationView({
  portfolios,
  illustrative,
  initialError = false,
}: {
  portfolios: OwnedPortfolioSummary[];
  illustrative: boolean;
  initialError?: boolean;
}) {
  const { wallet, connect } = useDemoWallet();
  const { draft, hydrated, update, setStep, reset } = useCreatorActivation();
  const [viewState, setViewState] = useState<ViewState>(
    initialError ? "error" : "loading",
  );
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (initialError) return;
    if (!hydrated) return;
    const timer = window.setTimeout(() => setViewState("ready"), 220);
    return () => window.clearTimeout(timer);
  }, [initialError, hydrated]);

  const publicPortfolios = useMemo(
    () => portfolios.filter((p) => p.visibility === "public"),
    [portfolios],
  );
  const personalPortfolios = useMemo(
    () => portfolios.filter((p) => p.visibility === "personal"),
    [portfolios],
  );

  function preview(action: string) {
    setMessage(
      `${action} — preview only. No real OAuth, publishing fee, verification submission or blockchain transaction.`,
    );
  }

  function requireWallet(action: string): boolean {
    if (wallet.state === "connected") return true;
    connect();
    preview(action);
    return false;
  }

  function goStep(step: ActivationWizardStep) {
    if (draft.status === "approved" && step !== "approved") return;
    setStep(step);
  }

  function selectPortfolio(p: OwnedPortfolioSummary) {
    if (!requireWallet("Select public portfolio")) return;
    update({
      selectedPortfolioId: p.id,
      selectedPortfolioName: p.name,
    });
    preview(`Selected public portfolio · ${p.name}`);
  }

  function connectSocial(platform: ActivationSocialPlatform) {
    if (!requireWallet(`Connect ${platform}`)) return;
    const preferred = draft.handle || draft.displayName || "previewcreator";
    const previewIds = previewSocialHandle(platform, preferred);
    update({
      socials: draft.socials.map((s) =>
        s.platform === platform
          ? {
              ...s,
              connected: true,
              handle: previewIds.handle,
              profileUrl: previewIds.profileUrl,
            }
          : s,
      ),
    });
    preview(`Connected ${platform}`);
  }

  function disconnectSocial(platform: ActivationSocialPlatform) {
    if (!requireWallet(`Disconnect ${platform}`)) return;
    update({
      socials: draft.socials.map((s) =>
        s.platform === platform
          ? { ...s, connected: false, handle: "", profileUrl: "" }
          : s,
      ),
    });
    preview(`Disconnected ${platform}`);
  }

  function submitVerification() {
    if (!requireWallet("Submit Verification")) return;
    if (!canSubmitVerification(draft)) {
      preview("Complete all verification fields before submitting");
      return;
    }
    const now = new Date().toISOString();
    update({
      status: "awaiting-verification",
      step: "verification",
      submittedAt: now,
      needsChangesNote: null,
    });
    preview("Verification submitted");
  }

  function simulateApproval() {
    if (!requireWallet("Approve creator access")) return;
    update({
      status: "approved",
      step: "approved",
      approvedAt: new Date().toISOString(),
      needsChangesNote: null,
    });
    preview("Creator access approved");
  }

  function simulateNeedsChanges() {
    if (!requireWallet("Request changes")) return;
    update({
      status: "needs-changes",
      step: "verification",
      needsChangesNote:
        "Preview: update your bio and confirm the linked public portfolio matches your social presence.",
    });
    preview("Verification returned — needs changes");
  }

  if (viewState === "loading" || !hydrated) {
    return (
      <div className="mx-auto space-y-4" style={{ maxWidth: "var(--content-max)" }}>
        <LoadingSkeleton title="Loading creator activation" lines={6} />
      </div>
    );
  }

  if (viewState === "error") {
    return (
      <div className="mx-auto space-y-4" style={{ maxWidth: "var(--content-max)" }}>
        <ErrorState
          title="Activation unavailable"
          description="Unable to load creator activation preview."
          action={
            <button
              type="button"
              className="app-gradient-btn rounded-[10px] px-4 py-2 text-sm font-bold"
              onClick={() => setViewState("ready")}
            >
              Retry
            </button>
          }
        />
      </div>
    );
  }

  const activeStep =
    draft.status === "approved" ? "approved" : draft.step;

  return (
    <div className="mx-auto space-y-5" style={{ maxWidth: "var(--content-max)" }}>
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            href={APP_ROUTES.creators}
            className="text-sm font-bold text-app-brand hover:underline"
          >
            ← Creators
          </Link>
          {illustrative ? (
            <span className="rounded-full bg-app-warning/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-app-warning">
              Illustrative
            </span>
          ) : null}
        </div>
        <h1 className="app-display text-2xl font-bold text-app-ink sm:text-[1.75rem]">
          Creator Activation
        </h1>
        <p className="max-w-2xl text-sm text-app-muted">
          {CREATOR_ACTIVATION_REQUIREMENT_COPY}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={draft.status} />
          <span className="text-[11px] text-app-muted">
            Progress persists locally · preview only
          </span>
          <button
            type="button"
            onClick={() => {
              reset();
              preview("Activation progress reset");
            }}
            className="h-7 rounded-full border border-app-line px-2.5 text-[10px] font-bold text-app-muted"
          >
            Reset preview
          </button>
        </div>
      </header>

      {wallet.state !== "connected" ? (
        <div className="app-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-app-ink">Wallet disconnected</p>
            <p className="mt-0.5 text-xs text-app-muted">
              Browse the sequence freely. Connect for connect, submit and approve
              previews.
            </p>
          </div>
          <button
            type="button"
            onClick={connect}
            className="h-9 app-gradient-btn rounded-[10px] px-4 text-[12px] font-bold text-white"
          >
            Connect Wallet
          </button>
        </div>
      ) : null}

      {message ? (
        <p className="rounded-[10px] border border-app-line bg-app-soft px-3 py-2 text-xs text-app-muted">
          {message}
        </p>
      ) : null}

      <nav
        aria-label="Activation steps"
        className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
      >
        {STEPS.map((s) => {
          const done =
            (s.id === "portfolio" && hasSelectedPublicPortfolio(draft)) ||
            (s.id === "social" && hasConnectedSocial(draft)) ||
            (s.id === "verification" &&
              (draft.status === "awaiting-verification" ||
                draft.status === "approved" ||
                draft.status === "needs-changes")) ||
            (s.id === "approved" && draft.status === "approved");
          const current = activeStep === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => goStep(s.id)}
              className={[
                "rounded-[12px] border px-3 py-3 text-left",
                current
                  ? "border-app-brand bg-app-brand/10"
                  : "border-app-line bg-app-elevated",
              ].join(" ")}
            >
              <p className="text-[10px] font-bold uppercase tracking-wide text-app-muted">
                Step {s.number}
                {done ? " · Done" : ""}
              </p>
              <p className="mt-1 text-sm font-bold text-app-ink">{s.label}</p>
            </button>
          );
        })}
      </nav>

      {activeStep === "portfolio" ? (
        <section className="app-panel space-y-4 p-4 sm:p-5">
          <div>
            <h2 className="app-display text-lg font-bold text-app-ink">
              1. Publish a Public Portfolio
            </h2>
            <p className="mt-1 text-sm text-app-muted">
              Select an existing published public portfolio. Personal portfolios
              do not qualify for creator activation.
            </p>
            <p className="mt-2 text-xs text-app-muted">
              Publishing requirement: visibility must be{" "}
              <span className="font-semibold text-app-ink">Public</span>. Any
              publish fee remains preview-only in this build.
            </p>
          </div>

          {publicPortfolios.length === 0 ? (
            <EmptyState
              title="No public portfolio"
              description="Create and publish a public portfolio or index to continue activation."
              action={
                <Link
                  href={APP_ROUTES.create}
                  className="inline-flex h-10 items-center app-gradient-btn rounded-[10px] px-4 text-sm font-bold text-white"
                >
                  Create & Publish Portfolio
                </Link>
              }
            />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {publicPortfolios.map((p) => {
                const selected = draft.selectedPortfolioId === p.id;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => selectPortfolio(p)}
                      className={[
                        "w-full rounded-[12px] border p-4 text-left",
                        selected
                          ? "border-app-brand bg-app-brand/10"
                          : "border-app-line bg-app-soft",
                      ].join(" ")}
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md bg-app-elevated px-1.5 py-0.5 text-[9px] font-bold uppercase text-app-muted">
                          {p.kind}
                        </span>
                        <span className="rounded-md bg-app-brand/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-app-brand">
                          Public
                        </span>
                        {p.isIllustrative ? (
                          <span className="rounded-md bg-app-warning/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-app-warning">
                            Illustrative
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm font-bold text-app-ink">
                        {p.name}
                      </p>
                      <p className="mt-1 text-[11px] text-app-muted">
                        {formatUsd(p.valueUsd, true)} ·{" "}
                        {formatPercent(p.performance30d, true)} · {p.status}
                      </p>
                      <p className="mt-2 text-[11px] font-bold text-app-brand">
                        {selected ? "Selected" : "Select for activation"}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {personalPortfolios.length > 0 ? (
            <div className="rounded-[10px] border border-dashed border-app-line bg-app-soft px-3 py-3">
              <p className="text-xs font-bold text-app-ink">
                Personal portfolios (not eligible)
              </p>
              <ul className="mt-1 space-y-1 text-[11px] text-app-muted">
                {personalPortfolios.map((p) => (
                  <li key={p.id}>
                    {p.name} · Personal — does not qualify
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Link
              href={APP_ROUTES.create}
              className="inline-flex h-9 items-center rounded-[10px] border border-app-line px-3 text-[12px] font-bold text-app-ink"
            >
              Create & Publish Portfolio
            </Link>
            <button
              type="button"
              disabled={!hasSelectedPublicPortfolio(draft)}
              onClick={() => goStep("social")}
              className="h-9 app-gradient-btn rounded-[10px] px-3 text-[12px] font-bold text-white disabled:opacity-40"
            >
              Continue to Social
            </button>
          </div>
        </section>
      ) : null}

      {activeStep === "social" ? (
        <section className="app-panel space-y-4 p-4 sm:p-5">
          <div>
            <h2 className="app-display text-lg font-bold text-app-ink">
              2. Connect Social Media
            </h2>
            <p className="mt-1 text-sm text-app-muted">
              Connect at least one social profile. OAuth is preview-only — no
              real account linking.
            </p>
          </div>
          <ul className="space-y-3">
            {draft.socials.map((s) => (
              <li
                key={s.platform}
                className="flex flex-col gap-3 rounded-[12px] border border-app-line bg-app-soft p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-bold text-app-ink">{s.platform}</p>
                  <p className="text-[11px] text-app-muted">
                    {s.connected ? (
                      <>
                        Connected · {s.handle} ·{" "}
                        <span className="font-semibold text-app-ink">
                          Preview
                        </span>
                      </>
                    ) : (
                      "Not Connected"
                    )}
                  </p>
                  {s.connected && s.profileUrl ? (
                    <p className="mt-0.5 text-[11px] text-app-muted">
                      {s.profileUrl}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {s.connected ? (
                    <button
                      type="button"
                      onClick={() => disconnectSocial(s.platform)}
                      className="h-9 rounded-[10px] border border-app-line px-3 text-[12px] font-bold text-app-ink"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => connectSocial(s.platform)}
                      className="h-9 app-gradient-btn rounded-[10px] px-3 text-[12px] font-bold text-white"
                    >
                      Connect {s.platform}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {!hasConnectedSocial(draft) ? (
            <p className="text-xs font-semibold text-app-warning">
              At least one connected social profile is required.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => goStep("portfolio")}
              className="h-9 rounded-[10px] border border-app-line px-3 text-[12px] font-bold text-app-ink"
            >
              Back
            </button>
            <button
              type="button"
              disabled={!hasConnectedSocial(draft)}
              onClick={() => goStep("verification")}
              className="h-9 app-gradient-btn rounded-[10px] px-3 text-[12px] font-bold text-white disabled:opacity-40"
            >
              Continue to Verification
            </button>
          </div>
        </section>
      ) : null}

      {activeStep === "verification" ? (
        <section className="app-panel space-y-4 p-4 sm:p-5">
          <div>
            <h2 className="app-display text-lg font-bold text-app-ink">
              3. Submit Verification
            </h2>
            <p className="mt-1 text-sm text-app-muted">
              Confirm your creator identity. Submission is preview-only and does
              not contact a verifier.
            </p>
          </div>

          {draft.status === "needs-changes" && draft.needsChangesNote ? (
            <div
              className="rounded-[10px] border border-app-warning/40 bg-app-warning/10 px-3 py-2 text-xs text-app-ink"
              role="status"
            >
              <p className="font-bold">Needs Changes</p>
              <p className="mt-1">{draft.needsChangesNote}</p>
            </div>
          ) : null}

          {draft.status === "awaiting-verification" ? (
            <div className="space-y-3 rounded-[12px] border border-app-brand/30 bg-app-brand/5 p-4">
              <p className="text-sm font-bold text-app-ink">
                Awaiting Verification
              </p>
              <p className="text-xs text-app-muted">
                Your illustrative submission is pending review. Use the preview
                controls below — no real review pipeline runs.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={simulateApproval}
                  className="h-9 app-gradient-btn rounded-[10px] px-3 text-[12px] font-bold text-white"
                >
                  Simulate Approval (preview)
                </button>
                <button
                  type="button"
                  onClick={simulateNeedsChanges}
                  className="h-9 rounded-[10px] border border-app-line px-3 text-[12px] font-bold text-app-ink"
                >
                  Simulate Needs Changes
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-bold text-app-muted">
                  Creator display name
                  <input
                    value={draft.displayName}
                    onChange={(e) => update({ displayName: e.target.value })}
                    className="mt-1 h-10 w-full rounded-[10px] border border-app-line bg-app-elevated px-3 text-sm text-app-ink"
                    placeholder="Display name"
                  />
                </label>
                <label className="block text-xs font-bold text-app-muted">
                  Handle
                  <input
                    value={draft.handle}
                    onChange={(e) =>
                      update({
                        handle: e.target.value
                          .replace(/^@/, "")
                          .toLowerCase()
                          .replace(/[^a-z0-9_-]/g, ""),
                      })
                    }
                    className="mt-1 h-10 w-full rounded-[10px] border border-app-line bg-app-elevated px-3 text-sm text-app-ink"
                    placeholder="handle"
                  />
                </label>
              </div>
              <label className="block text-xs font-bold text-app-muted">
                Bio
                <textarea
                  value={draft.bio}
                  onChange={(e) => update({ bio: e.target.value })}
                  rows={3}
                  className="mt-1 w-full rounded-[10px] border border-app-line bg-app-elevated px-3 py-2 text-sm text-app-ink"
                  placeholder="Short creator bio"
                />
              </label>
              <label className="block text-xs font-bold text-app-muted">
                Specialty / category
                <select
                  value={draft.specialty}
                  onChange={(e) =>
                    update({
                      specialty: e.target.value as typeof draft.specialty,
                    })
                  }
                  className="mt-1 h-10 w-full rounded-[10px] border border-app-line bg-app-elevated px-3 text-sm text-app-ink"
                >
                  <option value="">Select specialty</option>
                  {ACTIVATION_SPECIALTIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>

              <div className="rounded-[10px] border border-app-line bg-app-soft px-3 py-3 text-xs text-app-muted">
                <p>
                  <span className="font-bold text-app-ink">
                    Selected public portfolio:{" "}
                  </span>
                  {draft.selectedPortfolioName ?? "None selected"}
                </p>
                <p className="mt-1">
                  <span className="font-bold text-app-ink">
                    Connected social:{" "}
                  </span>
                  {hasConnectedSocial(draft)
                    ? draft.socials
                        .filter((s) => s.connected)
                        .map((s) => `${s.platform} ${s.handle}`)
                        .join(" · ")
                    : "None connected"}
                </p>
              </div>

              <label className="flex items-start gap-2 text-sm text-app-ink">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={draft.disclosuresAccepted}
                  onChange={(e) =>
                    update({ disclosuresAccepted: e.target.checked })
                  }
                />
                <span>
                  I confirm the activation disclosures. Creators never control
                  investor funds. All figures and actions in this preview are
                  Illustrative.
                </span>
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => goStep("social")}
                  className="h-9 rounded-[10px] border border-app-line px-3 text-[12px] font-bold text-app-ink"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={!canSubmitVerification(draft)}
                  onClick={submitVerification}
                  className="h-9 app-gradient-btn rounded-[10px] px-3 text-[12px] font-bold text-white disabled:opacity-40"
                >
                  Submit Verification
                </button>
              </div>
            </>
          )}
        </section>
      ) : null}

      {activeStep === "approved" || draft.status === "approved" ? (
        <section className="app-panel space-y-4 border-app-brand/30 p-4 sm:p-5">
          <div>
            <h2 className="app-display text-lg font-bold text-app-ink">
              4. Creator Access Approved
            </h2>
            <p className="mt-1 text-sm text-app-muted">
              Preview approval complete. Open your Creator Dashboard to manage
              earnings, live products and audience tools.
            </p>
          </div>
          <ul className="space-y-2 text-sm text-app-ink">
            <li>✓ Creator profile created (preview)</li>
            <li>
              ✓ Public portfolio linked ·{" "}
              {draft.selectedPortfolioName ?? "—"}
            </li>
            <li>
              ✓ Social profile connected ·{" "}
              {draft.socials
                .filter((s) => s.connected)
                .map((s) => s.platform)
                .join(", ") || "—"}
            </li>
            <li>✓ Verification approved (preview)</li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <Link
              href={APP_ROUTES.creatorDashboard}
              className="inline-flex h-10 items-center app-gradient-btn rounded-[10px] px-4 text-[12px] font-bold text-white"
            >
              Open Creator Dashboard
            </Link>
            <Link
              href={APP_ROUTES.creatorProfile(
                draft.handle.trim() || "indexla",
              )}
              className="inline-flex h-10 items-center rounded-[10px] border border-app-line px-4 text-[12px] font-bold text-app-ink"
            >
              View Public Profile
            </Link>
            <Link
              href={`${APP_ROUTES.strategies}?tab=publish`}
              className="inline-flex h-10 items-center rounded-[10px] border border-app-line px-4 text-[12px] font-bold text-app-ink"
            >
              Publish Strategy
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function StatusBadge({ status }: { status: CreatorActivationStatus }) {
  return (
    <span className="rounded-full border border-app-line bg-app-elevated px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-app-ink">
      {statusLabel(status)}
    </span>
  );
}
