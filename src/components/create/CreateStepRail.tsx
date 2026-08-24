"use client";

import type { CreateWizardStep } from "@/lib/domain/create";
import { stepLabel, wizardStepsFor, type CreateProductType } from "@/lib/domain/create";

export function CreateStepRail({
  productType,
  current,
}: {
  productType: CreateProductType | null;
  current: CreateWizardStep;
}) {
  const steps = wizardStepsFor(productType);
  const currentIndex = steps.indexOf(current);

  return (
    <ol className="flex flex-wrap items-center gap-1.5 sm:gap-2">
      {steps.map((step, index) => {
        const active = step === current;
        const done = currentIndex > index;
        return (
          <li key={step} className="flex items-center gap-1.5 sm:gap-2">
            {index > 0 ? (
              <span
                aria-hidden
                className={[
                  "hidden h-px w-3 sm:block sm:w-5",
                  done || active ? "bg-app-brand/50" : "bg-app-line",
                ].join(" ")}
              />
            ) : null}
            <span
              className={[
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-wide sm:px-3",
                active
                  ? "border-transparent bg-gradient-to-r from-[var(--color-brand-grad-from)] to-[var(--color-brand-grad-to)] text-white shadow-[0_6px_18px_-10px_rgba(37,99,235,0.7)]"
                  : done
                    ? "border-app-brand/30 bg-app-brand/10 text-app-brand"
                    : "border-app-line/80 bg-app-elevated text-app-ink/65",
              ].join(" ")}
            >
              <span
                className={[
                  "inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px]",
                  active
                    ? "bg-white/20"
                    : done
                      ? "bg-app-brand/20"
                      : "bg-app-soft",
                ].join(" ")}
              >
                {index + 1}
              </span>
              {stepLabel(step)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
