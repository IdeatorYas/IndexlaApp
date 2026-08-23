/** Shared preview-only safety message for demo actions. */
export function PreviewOnlyMessage({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      role="status"
      className={[
        "rounded-[10px] border border-app-line bg-app-soft px-3 py-2 text-xs text-app-muted",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </p>
  );
}

export function formatPreviewOnly(action: string, detail?: string): string {
  const base = `${action} — preview only. No real wallet signing, payment, claim or on-chain execution was submitted.`;
  return detail ? `${base} ${detail}` : base;
}
