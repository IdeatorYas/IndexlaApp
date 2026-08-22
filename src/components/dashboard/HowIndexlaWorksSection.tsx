export function HowIndexlaWorksSection() {
  const steps = [
    {
      n: "01",
      title: "Discover or Build",
      body: "Browse Featured indexes and portfolios, or create your own.",
    },
    {
      n: "02",
      title: "Define Strategy and Permissions",
      body: "Choose rules, routes and revocable automation permissions.",
    },
    {
      n: "03",
      title: "Own Assets and Automate",
      body: "Keep underlying assets in your wallet while INDEXLA coordinates execution.",
    },
  ];

  return (
    <section className="app-panel-glow border app-border-accent-violet p-5 md:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="app-display text-xl font-bold text-app-ink md:text-2xl">
            How INDEXLA Works
          </h2>
          <p className="mt-1 text-sm font-semibold text-app-brand">
            AI monitors. Your rules decide. Smart contracts enforce.
          </p>
        </div>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {steps.map((step) => (
          <div key={step.n} className="app-panel-soft p-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-app-brand">
              {step.n}
            </p>
            <h3 className="app-display mt-2 text-lg font-bold text-app-ink">
              {step.title}
            </h3>
            <p className="mt-2 text-sm text-app-muted">{step.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
