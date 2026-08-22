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
    <ol className="flex flex-wrap gap-2">
      {steps.map((step, index) => {
        const active = step === current;
        const done = currentIndex > index;
        return (
          <li
            key={step}
            className={[
              "rounded-full px-3 py-1 text-[11px] font-bold",
              active
                ? "bg-app-brand text-white"
                : done
                  ? "bg-app-soft text-app-brand"
                  : "border border-app-line bg-app-elevated text-app-ink/70",
            ].join(" ")}
          >
            {index + 1}. {stepLabel(step)}
          </li>
        );
      })}
    </ol>
  );
}
