"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CREATOR_ACTIVATION_STORAGE_KEY,
  createEmptyActivationDraft,
  deriveActivationStatus,
  type ActivationWizardStep,
  type CreatorActivationDraft,
} from "@/lib/domain/creator-activation";

export function readStoredActivationDraft(): CreatorActivationDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CREATOR_ACTIVATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CreatorActivationDraft;
    if (parsed?.version !== 1) return null;
    return {
      ...createEmptyActivationDraft(),
      ...parsed,
      socials:
        parsed.socials?.length === 3
          ? parsed.socials
          : createEmptyActivationDraft().socials,
      status: deriveActivationStatus({
        ...createEmptyActivationDraft(),
        ...parsed,
      }),
    };
  } catch {
    return null;
  }
}

export function useCreatorActivation() {
  const [draft, setDraft] = useState<CreatorActivationDraft>(() =>
    createEmptyActivationDraft(),
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readStoredActivationDraft();
    if (stored) setDraft(stored);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const next: CreatorActivationDraft = {
      ...draft,
      status: deriveActivationStatus(draft),
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(
      CREATOR_ACTIVATION_STORAGE_KEY,
      JSON.stringify(next),
    );
    window.dispatchEvent(
      new CustomEvent("indexla-creator-activation-changed"),
    );
  }, [draft, hydrated]);

  const update = useCallback((patch: Partial<CreatorActivationDraft>) => {
    setDraft((prev) => {
      const merged = { ...prev, ...patch };
      return { ...merged, status: deriveActivationStatus(merged) };
    });
  }, []);

  const setStep = useCallback((step: ActivationWizardStep) => {
    setDraft((prev) => ({ ...prev, step }));
  }, []);

  const reset = useCallback(() => {
    const empty = createEmptyActivationDraft();
    setDraft(empty);
    window.localStorage.removeItem(CREATOR_ACTIVATION_STORAGE_KEY);
    window.dispatchEvent(
      new CustomEvent("indexla-creator-activation-changed"),
    );
  }, []);

  return { draft, hydrated, update, setStep, reset, setDraft };
}
