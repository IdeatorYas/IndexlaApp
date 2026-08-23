/** Shared Illustrative label — use everywhere instead of ad-hoc pills. */
export function IllustrativeBadge({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-md border border-app-warning/25 bg-app-warning/10 font-bold uppercase tracking-wide text-app-warning",
        compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      Illustrative
    </span>
  );
}
