export function TrustStripSection() {
  const items = [
    "Non-Custodial",
    "Real Underlying Assets",
    "Revocable Permissions",
    "Cross-Chain",
    "MEV-Aware Execution",
  ];

  return (
    <section className="app-panel px-3 py-2 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-x-3 gap-y-1.5">
          {items.map((item) => (
            <li
              key={item}
              className="flex items-center gap-1.5 rounded-full border border-app-line/60 bg-app-soft/50 px-2 py-0.5 text-[11px] font-semibold text-app-muted sm:text-[12px]"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-app-brand to-[color:var(--color-accent-cyan)]" />
              {item}
            </li>
          ))}
        </ul>
        <p className="app-gradient-text text-[11px] font-bold sm:text-[12px]">
          0% Management · 0% Performance · 0% Exit
        </p>
      </div>
    </section>
  );
}
