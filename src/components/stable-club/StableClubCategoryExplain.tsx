"use client";

import { STABLE_CLUB_CATEGORY_COPY } from "@/lib/stable-club/demo-strategies";

export function StableClubCategoryExplain() {
  return (
    <section className="mt-14 border-t border-sky-400/15 pt-10" aria-labelledby="sc-categories-heading">
      <header className="mx-auto max-w-3xl text-center">
        <h2
          id="sc-categories-heading"
          className="app-display text-2xl font-bold tracking-tight text-app-ink sm:text-3xl"
        >
          {STABLE_CLUB_CATEGORY_COPY.heading}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-app-muted sm:text-base">
          {STABLE_CLUB_CATEGORY_COPY.subheading}
        </p>
      </header>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {STABLE_CLUB_CATEGORY_COPY.categories.map((cat) => (
          <article
            key={cat.id}
            className="rounded-[16px] border border-sky-400/20 bg-[rgba(10,28,54,0.55)] p-5 shadow-[inset_0_1px_0_rgba(147,197,253,0.08)]"
          >
            <h3 className="app-display text-lg font-bold text-app-ink">{cat.title}</h3>
            <p className="mt-1 text-xs font-bold uppercase tracking-wide text-sky-300">{cat.riskLabel}</p>
            <p className="mt-3 text-sm leading-relaxed text-app-muted">{cat.body}</p>
          </article>
        ))}
      </div>

      <p className="mx-auto mt-8 max-w-3xl text-center text-sm font-semibold leading-relaxed text-sky-100/90">
        {STABLE_CLUB_CATEGORY_COPY.activationNote}
      </p>
    </section>
  );
}
