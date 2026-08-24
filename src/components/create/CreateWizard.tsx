"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CreateStepRail } from "@/components/create/CreateStepRail";
import { StepAssetsAllocations } from "@/components/create/StepAssetsAllocations";
import { StepNameDescription } from "@/components/create/StepNameDescription";
import { StepReviewConfirm } from "@/components/create/StepReviewConfirm";
import { StepStrategyAutomation } from "@/components/create/StepStrategyAutomation";
import { useCreateDraft } from "@/components/create/useCreateDraft";
import {
  allocationTotal,
  createEmptyDraft,
  strategyIsConfigured,
  wizardStepsFor,
  type MarketAsset,
} from "@/lib/domain/create";
import { DEGEN_RISK_WARNING } from "@/lib/domain/degen-club";
import { LoadingSkeleton } from "@/components/states/AppStates";

export function CreateWizard() {
  const searchParams = useSearchParams();
  const { draft, hydrated, update, setStep, reset, setDraft } = useCreateDraft();
  const [assetCache, setAssetCache] = useState<MarketAsset[]>([]);
  const [feeModalOpen, setFeeModalOpen] = useState(false);
  const [reviewCanConfirm, setReviewCanConfirm] = useState(false);
  const templateApplied = useRef(false);

  const steps = wizardStepsFor(draft.productType);
  const stepIndex = steps.indexOf(draft.step);
  const isDegenTemplate = searchParams.get("template") === "degen";

  useEffect(() => {
    if (!hydrated || templateApplied.current) return;
    if (searchParams.get("template") !== "degen") return;
    templateApplied.current = true;
    setDraft({
      ...createEmptyDraft(),
      productType: "index",
      categoryId: null,
      otherCategoryId: "meme-token",
      step: "assets",
      name: "My Degen Index",
      thesis:
        "Diversified memecoin index — extreme risk. Illustrative preview only.",
      visibility: "public",
      degenAcknowledged: false,
    });
  }, [hydrated, searchParams, setDraft]);

  const canContinue = useMemo(() => {
    switch (draft.step) {
      case "basics":
        return (
          draft.productType != null &&
          draft.name.trim().length > 0 &&
          draft.thesis.trim().length > 0
        );
      case "assets":
        return (
          draft.allocations.length > 0 &&
          allocationTotal(draft.allocations) === 100
        );
      case "strategy":
        return strategyIsConfigured(draft.strategy);
      case "review": {
        const degen =
          isDegenTemplate || draft.otherCategoryId === "meme-token";
        return (
          draft.investmentUsd > 0 && (!degen || draft.degenAcknowledged)
        );
      }
      default:
        return false;
    }
  }, [draft, isDegenTemplate]);

  function goNext() {
    const idx = steps.indexOf(draft.step);
    if (idx < steps.length - 1) {
      setFeeModalOpen(false);
      setStep(steps[idx + 1]);
    }
  }

  function goBack() {
    const idx = steps.indexOf(draft.step);
    if (idx > 0) {
      setFeeModalOpen(false);
      setStep(steps[idx - 1]);
    }
  }

  if (!hydrated) {
    return <LoadingSkeleton title="Loading create draft" lines={5} />;
  }

  return (
    <div
      className="mx-auto space-y-4 pb-2 sm:space-y-5"
      style={{ maxWidth: "var(--content-max)" }}
    >
      <header className="overflow-hidden rounded-[16px] border border-app-line/55 bg-gradient-to-br from-app-elevated via-app-elevated to-app-panel/90 p-4 shadow-[0_14px_36px_-28px_rgba(0,0,0,0.35)] sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-app-dim">
              Builder
            </p>
            <h1 className="app-display mt-1 text-2xl font-bold tracking-tight text-app-ink sm:text-[1.85rem]">
              Create Portfolio / Index
            </h1>
            <p className="mt-1.5 max-w-xl text-sm text-app-muted">
              Four-step builder with autosaved drafts. Preview only — wallet
              approval happens on final confirmation.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              templateApplied.current = false;
              reset();
            }}
            className="h-10 rounded-[12px] border border-app-line/80 bg-app-elevated px-3.5 text-[12px] font-bold text-app-muted transition hover:border-app-brand/35 hover:text-app-ink"
          >
            Reset draft
          </button>
        </div>
        {isDegenTemplate ? (
          <div
            className="mt-4 rounded-[12px] border border-app-danger/40 bg-app-danger/10 px-4 py-3 text-sm font-semibold text-app-danger"
            role="alert"
          >
            {DEGEN_RISK_WARNING}
          </div>
        ) : null}
        <div className="mt-4 space-y-2">
          <CreateStepRail current={draft.step} />
          <p className="text-[11px] text-app-dim">
            Draft autosaved locally · step {Math.max(1, stepIndex + 1)} of{" "}
            {steps.length}
            {isDegenTemplate ? " · Degen Index template" : ""}
          </p>
        </div>
      </header>

      <div className="min-h-[20rem]">
        {draft.step === "basics" ? (
          <StepNameDescription draft={draft} onChange={update} />
        ) : null}

        {draft.step === "assets" ? (
          <StepAssetsAllocations
            draft={draft}
            onChangeAllocations={(allocations) => update({ allocations })}
            onNarrativeChange={(categoryId) =>
              update({ categoryId, otherCategoryId: null })
            }
            onAssetsLoaded={setAssetCache}
          />
        ) : null}

        {draft.step === "strategy" ? (
          <StepStrategyAutomation
            draft={draft}
            onChange={(strategy) => update({ strategy })}
            onInvestmentChange={(investmentUsd) => update({ investmentUsd })}
          />
        ) : null}

        {draft.step === "review" ? (
          <StepReviewConfirm
            draft={draft}
            assets={assetCache}
            onChange={update}
            feeModalOpen={feeModalOpen}
            onFeeModalOpenChange={setFeeModalOpen}
            onCanConfirmChange={setReviewCanConfirm}
          />
        ) : null}
      </div>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-app-line/70 bg-app-elevated/95 p-3 shadow-[0_12px_40px_-20px_rgba(0,0,0,0.45)] backdrop-blur-md">
        <button
          type="button"
          onClick={goBack}
          disabled={stepIndex <= 0}
          className="h-11 rounded-[12px] border border-app-line/80 px-4 text-sm font-bold text-app-ink transition hover:border-app-brand/35 disabled:opacity-40"
        >
          Back
        </button>
        {draft.step !== "review" ? (
          <button
            type="button"
            onClick={goNext}
            disabled={!canContinue}
            className="app-gradient-btn h-11 rounded-[12px] px-6 text-sm font-bold disabled:opacity-40"
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setFeeModalOpen(true)}
            disabled={!reviewCanConfirm}
            className="app-gradient-btn h-11 rounded-[12px] px-6 text-sm font-bold disabled:opacity-40"
          >
            Continue to confirmation
          </button>
        )}
      </div>
    </div>
  );
}
