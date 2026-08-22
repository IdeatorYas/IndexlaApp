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
    <section className="app-panel overflow-hidden app-accent-bar-violet">
      <div className="border-b border-app-line px-4 py-3 sm:px-5">
        <h2 className="app-display text-[16px] font-bold text-app-ink">
          How INDEXLA Works
        </h2>
        <p className="mt-0.5 text-[12px] font-semibold text-app-brand">
          AI monitors. Your rules decide. Smart contracts enforce.
        </p>
      </div>
      <div className="grid gap-0 md:grid-cols-3 md:divide-x md:divide-app-line">
        {steps.map((step) => (
          <div key={step.n} className="px-4 py-3.5 sm:px-5">
            <p className="app-label text-app-brand">{step.n}</p>
            <h3 className="app-display mt-1 text-[14px] font-bold text-app-ink">
              {step.title}
            </h3>
            <p className="mt-1 text-[12px] leading-snug text-app-muted">
              {step.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
