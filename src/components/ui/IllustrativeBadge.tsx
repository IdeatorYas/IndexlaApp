export function IllustrativeBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full bg-app-warning/15 font-medium text-app-warning",
        compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-xs",
      ].join(" ")}
    >
      Illustrative
    </span>
  );
}
