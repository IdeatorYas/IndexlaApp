"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CREATE_DRAFT_STORAGE_KEY,
  createEmptyDraft,
  type CreateDraft,
  type CreateWizardStep,
} from "@/lib/domain/create";

export function useCreateDraft() {
  const [draft, setDraft] = useState<CreateDraft>(() => createEmptyDraft());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CREATE_DRAFT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CreateDraft;
        if (parsed?.version === 1) {
          setDraft(parsed);
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
