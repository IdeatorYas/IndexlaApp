"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CREATE_DRAFT_STORAGE_KEY,
  createEmptyDraft,
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
  "other",
]);

function normalizeStoredDraft(parsed: CreateDraft): CreateDraft {
  let next = { ...parsed, strategy: normalizeStrategyConfig(parsed.strategy ?? {}) };
  // Legacy Index Builder memecoins → Degen Club-only meme narrative via Others id.
  if ((next.categoryId as string) === "memecoins") {
    next = {
      ...next,
      categoryId: "other",
      otherCategoryId: next.otherCategoryId ?? "meme-token",
    };
  }
  if (
    next.categoryId != null &&
    !VALID_CATEGORIES.has(next.categoryId)
  ) {
    next = { ...next, categoryId: null, otherCategoryId: null };
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
