"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CreateStepRail } from "@/components/create/CreateStepRail";
import { StepAssetsAllocations } from "@/components/create/StepAssetsAllocations";
import { StepChooseProduct } from "@/components/create/StepChooseProduct";
import { StepIndexCategory } from "@/components/create/StepIndexCategory";
import { StepInvestmentDetails } from "@/components/create/StepInvestmentDetails";
import { StepReviewConfirm } from "@/components/create/StepReviewConfirm";
import { StepStrategyAutomation } from "@/components/create/StepStrategyAutomation";
import { useCreateDraft } from "@/components/create/useCreateDraft";
import {
  allocationTotal,
  createEmptyDraft,
  wizardStepsFor,
  type CreateProductType,
  type MarketAsset,
} from "@/lib/domain/create";
import { DEGEN_RISK_WARNING } from "@/lib/domain/degen-club";
import { LoadingSkeleton } from "@/components/states/AppStates";

export function CreateWizard() {
  const searchParams = useSearchParams();
  const { draft, hydrated, update, setStep, reset, setDraft } = useCreateDraft();
  const [assetCache, setAssetCache] = useState<MarketAsset[]>([]);
  const templateApplied = useRef(false);

  const steps = wizardStepsFor(draft.productType);
  const stepIndex = steps.indexOf(draft.step);
  const isDegenTemplate = searchParams.get("template") === "degen";

  useEffect(() => {
    if (!hydrated || templateApplied.current) return;
    if (searchParams.get("template") !== "degen") return;
    templateApplied.current = true;
    const next = {
      ...createEmptyDraft(),
      productType: "index" as const,
      categoryId: "other" as const,
      otherCategoryId: "meme-token",
      step: "assets" as const,
      name: "My Degen Index",
      thesis:
        "Diversified memecoin index — extreme risk. Illustrative preview only.",
      visibility: "public" as const,
      degenAcknowledged: false,
    };
    setDraft(next);
  }, [hydrated, searchParams, setDraft]);

  const canContinue = useMemo(() => {
    switch (draft.step) {
      case "product":
        return draft.productType != null;
      case "category":
        if (!draft.categoryId) return false;
        if (draft.categoryId === "other") return Boolean(draft.otherCategoryId);
        return true;
      case "assets":
        return (
          draft.allocations.length > 0 &&
          allocationTotal(draft.allocations) === 100
        );
      case "strategy":
        if (draft.strategy.strategyId === "creator-strategy") {
          return Boolean(draft.strategy.creatorStrategyId);
        }
        return true;
      case "details":
        return (
          draft.name.trim().length > 0 &&
          draft.thesis.trim().length > 0 &&
          draft.investmentUsd > 0
        );
      case "review": {
        const degen =
          isDegenTemplate || draft.otherCategoryId === "meme-token";
        return !degen || draft.degenAcknowledged;
      }
      default:
        return false;
    }
  }, [draft, isDegenTemplate]);

  function goNext() {
    const idx = steps.indexOf(draft.step);
    if (idx < steps.length - 1) setStep(steps[idx + 1]);
  }

  function goBack() {
    const idx = steps.indexOf(draft.step);
    if (idx > 0) setStep(steps[idx - 1]);
  }

  function selectProduct(type: CreateProductType) {
    update({
      productType: type,
      categoryId: type === "portfolio" ? null : draft.categoryId,
      otherCategoryId: type === "portfolio" ? null : draft.otherCategoryId,
    });
  }

  if (!hydrated) {
    return <LoadingSkeleton title="Loading create draft" lines={5} />;
  }

  return (
    <div className="mx-auto space-y-5" style={{ maxWidth: "var(--content-max)" }}>
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="app-display text-2xl font-bold text-app-ink sm:text-[1.75rem]">
              Create Portfolio / Index
            </h1>
            <p className="mt-1 text-sm text-app-muted">
              Guided builder with autosaved drafts. Preview only — no wallet
              execution.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              templateApplied.current = false;
              reset();
            }}
            className="h-9 rounded-[10px] border border-app-line px-3 text-[12px] font-bold text-app-muted hover:text-app-ink"
          >
            Reset draft
          </button>
        </div>
        {isDegenTemplate ? (
          <div
            className="rounded-[10px] border border-app-danger/40 bg-app-danger/10 px-4 py-3 text-sm font-semibold text-app-danger"
            role="alert"
          >
            {DEGEN_RISK_WARNING}
          </div>
        ) : null}
        <CreateStepRail productType={draft.productType} current={draft.step} />
        <p className="text-[11px] text-app-dim">
          Draft autosaved locally · step {Math.max(1, stepIndex + 1)} of{" "}
          {steps.length}
          {isDegenTemplate ? " · Degen Index template" : ""}
        </p>
      </header>

      {draft.step === "product" ? (
        <StepChooseProduct draft={draft} onSelect={selectProduct} />
      ) : null}

      {draft.step === "category" ? (
        <StepIndexCategory
          draft={draft}
          onSelect={(categoryId) =>
            update({
              categoryId,
              otherCategoryId:
                categoryId === "other" ? draft.otherCategoryId : null,
            })
          }
          onSelectOther={(otherCategoryId) =>
            update({ categoryId: "other", otherCategoryId })
          }
        />
      ) : null}

      {draft.step === "assets" ? (
        <StepAssetsAllocations
          draft={draft}
          onChangeAllocations={(allocations) => update({ allocations })}
          onAssetsLoaded={setAssetCache}
        />
      ) : null}

      {draft.step === "strategy" ? (
        <StepStrategyAutomation
          draft={draft}
          onChange={(strategy) => update({ strategy })}
        />
      ) : null}

      {draft.step === "details" ? (
        <StepInvestmentDetails
          draft={draft}
          assets={assetCache}
          onChange={update}
        />
      ) : null}

      {draft.step === "review" ? (
        <StepReviewConfirm
          draft={draft}
          assets={assetCache}
          onChange={update}
        />
      ) : null}

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-app-line bg-app-elevated/95 p-3 shadow-[var(--shadow-card)] backdrop-blur">
        <button
          type="button"
          onClick={goBack}
          disabled={stepIndex <= 0}
          className="h-10 rounded-[10px] border border-app-line px-4 text-sm font-bold text-app-ink disabled:opacity-40"
        >
          Back
        </button>
        {draft.step !== "review" ? (
          <button
            type="button"
            onClick={goNext}
            disabled={!canContinue}
            className="app-gradient-btn h-10 rounded-[10px] px-5 text-sm font-bold disabled:opacity-40"
          >
            Continue
          </button>
        ) : (
          <p className="text-xs text-app-dim">
            Use preview actions above to finish without real execution.
          </p>
        )}
      </div>
    </div>
  );
}
