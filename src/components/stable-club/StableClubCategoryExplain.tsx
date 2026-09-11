"use client";

import { STABLE_CLUB_CATEGORY_COPY } from "@/lib/stable-club/demo-strategies";

export function StableClubCategoryExplain() {
  const { chainBaskets, riskBaskets } = STABLE_CLUB_CATEGORY_COPY;

  return (
    <section className="space-y-4" aria-label="Stable Club product explanation">
      <article className="app-panel rounded-2xl p-5 sm:p-6">
        <h2 className="app-display text-lg font-bold tracking-tight text-app-ink sm:text-xl">
          {chainBaskets.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-app-muted sm:text-[15px]">
          {chainBaskets.body}
        </p>
      </article>

      <article className="app-panel rounded-2xl p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="app-display text-lg font-bold tracking-tight text-app-ink sm:text-xl">
            {riskBaskets.title}
          </h2>
          <span className="rounded-full bg-app-brand/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-app-brand">
            Coming Soon
          </span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-app-muted sm:text-[15px]">
          {riskBaskets.intro}
        </p>
        <ul className="mt-4 space-y-3">
          {riskBaskets.levels.map((level) => (
            <li key={level.id} className="rounded-xl border border-app-line bg-app-elevated/70 px-3.5 py-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-app-brand">
                {level.riskLabel}
              </p>
              <p className="mt-1 text-sm font-semibold text-app-ink">{level.title}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-app-muted">{level.body}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[12px] leading-relaxed text-app-dim">{riskBaskets.footnote}</p>
      </article>
    </section>
  );
}

export function StableClubRiskDisclaimer() {
  return (
    <p
      role="note"
      className="px-1 text-center text-[11px] leading-relaxed text-app-dim sm:text-[12px]"
    >
      {STABLE_CLUB_CATEGORY_COPY.disclaimer}
    </p>
  );
}
