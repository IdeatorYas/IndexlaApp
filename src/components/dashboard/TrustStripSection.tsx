export function TrustStripSection() {
  const items = [
    "Non-Custodial",
    "Real Underlying Assets",
    "Revocable Permissions",
    "Cross-Chain",
    "MEV-Aware Execution",
  ];

  return (
    <section className="app-panel px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
          {items.map((item) => (
            <li
              key={item}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-app-muted sm:text-[12px]"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-app-brand" />
              {item}
            </li>
          ))}
        </ul>
        <p className="text-[11px] font-bold text-app-brand sm:text-[12px]">
          0% Management · 0% Performance · 0% Exit
        </p>
      </div>
    </section>
  );
}
