import { formatProductAttribution } from "@/lib/product/attribution";

export function ProductAttribution({
  creatorName,
  creatorHandle,
  verified = true,
  className = "truncate text-[11px] font-semibold text-app-muted",
}: {
  creatorName: string | null | undefined;
  creatorHandle?: string | null;
  verified?: boolean;
  className?: string;
}) {
  return (
    <p className={className}>
      {formatProductAttribution({ creatorName, creatorHandle, verified })}
    </p>
  );
}

export function ProductTypeBadge({
  kind,
}: {
  kind: "Index" | "Portfolio";
}) {
  const isIndex = kind === "Index";
  return (
    <span
      className={[
        "rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
        isIndex
          ? "bg-[color:var(--color-accent-blue)]/15 text-[color:var(--color-accent-blue)]"
          : "bg-[color:var(--color-accent-violet)]/15 text-[color:var(--color-accent-violet)]",
      ].join(" ")}
    >
      {kind}
    </span>
  );
}
