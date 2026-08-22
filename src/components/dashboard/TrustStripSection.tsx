export function TrustStripSection() {
  const items = [
    "Non-Custodial",
    "Real Underlying Assets",
    "Revocable Permissions",
    "Cross-Chain",
    "MEV-Aware Execution",
  ];

  return (
    <section className="app-panel px-4 py-5 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {items.map((item) => (
            <li
              key={item}
              className="flex items-center gap-2 text-xs font-semibold text-app-muted md:text-sm"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-app-brand" />
              {item}
            </li>
          ))}
        </ul>
        <p className="text-xs font-bold text-app-brand md:text-sm">
          0% Management · 0% Performance · 0% Exit
        </p>
      </div>
    </section>
  );
}
