export function IllustrativeBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-md border border-app-warning/25 bg-app-warning/10 font-semibold text-app-warning",
        compact ? "px-1.5 py-px text-[9px]" : "px-2 py-0.5 text-[11px]",
      ].join(" ")}
    >
      Illustrative
    </span>
  );
}
