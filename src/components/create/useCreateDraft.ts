"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CREATE_DRAFT_STORAGE_KEY,
  createEmptyDraft,
  migrateWizardStep,
  normalizeStrategyConfig,
  type CreateDraft,
  type CreateWizardStep,
  type IndexNarrativeCategory,
} from "@/lib/domain/create";

const VALID_CATEGORIES = new Set<IndexNarrativeCategory>([
  "rwa",
  "defi",
  "depin",
  "ai",
  "layer-1",
  "layer-2",
  "gaming",
  "oracles",
  "ai-agents",
  "liquid-staking",
  "restaking",
  "privacy",
  "interoperability",
  "modular-blockchain",
  "dex",
  "nft",
]);

const LEGACY_OTHER_TO_CATEGORY: Record<string, IndexNarrativeCategory> = {
  "liquid-staking": "liquid-staking",
  restaking: "restaking",
  privacy: "privacy",
  interoperability: "interoperability",
  "modular-blockchain": "modular-blockchain",
  "decentralized-exchange": "dex",
  "non-fungible-tokens-nft": "nft",
};

function normalizeStoredDraft(parsed: CreateDraft): CreateDraft {
  let next: CreateDraft = {
    ...parsed,
    step: migrateWizardStep(String(parsed.step)),
    strategy: normalizeStrategyConfig(parsed.strategy ?? {}),
  };

  if ((next.categoryId as string) === "memecoins") {
    next = {
      ...next,
      categoryId: null,
      otherCategoryId: next.otherCategoryId ?? "meme-token",
    };
  }

  if ((next.categoryId as string) === "other") {
    const mapped = next.otherCategoryId
      ? LEGACY_OTHER_TO_CATEGORY[next.otherCategoryId]
      : undefined;
    next = {
      ...next,
      categoryId: mapped ?? null,
      otherCategoryId:
        next.otherCategoryId === "meme-token" ? "meme-token" : null,
    };
  }

  if (
    next.categoryId != null &&
    !VALID_CATEGORIES.has(next.categoryId)
  ) {
    next = { ...next, categoryId: null };
  }

  return next;
}

export function useCreateDraft() {
  const [draft, setDraft] = useState<CreateDraft>(() => createEmptyDraft());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CREATE_DRAFT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CreateDraft;
        if (parsed?.version === 1) {
          setDraft(normalizeStoredDraft(parsed));
        }
      }
    } catch {
      // ignore corrupt drafts
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const next = { ...draft, updatedAt: new Date().toISOString() };
    window.localStorage.setItem(CREATE_DRAFT_STORAGE_KEY, JSON.stringify(next));
  }, [draft, hydrated]);

  const update = useCallback((patch: Partial<CreateDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const setStep = useCallback((step: CreateWizardStep) => {
    setDraft((prev) => ({ ...prev, step }));
  }, []);

  const reset = useCallback(() => {
    const empty = createEmptyDraft();
    setDraft(empty);
    window.localStorage.removeItem(CREATE_DRAFT_STORAGE_KEY);
  }, []);

  return { draft, hydrated, update, setStep, reset, setDraft };
}
