type HeadingTone = "brand" | "cyan" | "violet" | "emerald" | "amber" | "explore";
type HeadingTag = "span" | "h2" | "h3";

const TONE_STYLES: Record<
  HeadingTone,
  { box: string; text: string }
> = {
  brand: {
    box: "border-app-brand/35 bg-gradient-to-r from-app-brand/20 to-[color:var(--color-accent-violet)]/15",
    text: "text-app-brand",
  },
  cyan: {
    box: "border-[color:var(--color-accent-cyan)]/35 bg-[color:var(--color-accent-cyan)]/10",
    text: "text-[color:var(--color-accent-cyan)]",
  },
  violet: {
    box: "border-[color:var(--color-accent-violet)]/35 bg-[color:var(--color-accent-violet)]/10",
    text: "text-[color:var(--color-accent-violet)]",
  },
  emerald: {
    box: "border-app-success/30 bg-app-success/10",
    text: "text-app-success",
  },
  amber: {
    box: "border-[color:var(--color-accent-amber)]/35 bg-[color:var(--color-accent-amber)]/10",
    text: "text-[color:var(--color-accent-amber)]",
  },
  explore: {
    box: "border-app-brand/40 bg-gradient-to-r from-app-brand/15 via-[color:var(--color-accent-violet)]/12 to-[color:var(--color-accent-cyan)]/10",
    text: "text-app-ink",
  },
};

export function DashboardSectionHeading({
  label,
  tone = "brand",
  size = "sm",
  className = "",
  as: Tag = "span",
}: {
  label: string;
  tone?: HeadingTone;
  size?: "sm" | "md" | "lg";
  className?: string;
  as?: HeadingTag;
}) {
  const styles = TONE_STYLES[tone];
  const sizeClass =
    size === "lg"
      ? "px-4 py-1.5 text-sm sm:text-base"
      : size === "md"
        ? "px-3 py-1 text-[12px] sm:text-[13px]"
        : "px-2.5 py-0.5 text-[10px] sm:text-[11px]";

  return (
    <Tag
      className={[
        "inline-flex items-center rounded-[8px] border font-bold uppercase tracking-[0.12em]",
        styles.box,
        styles.text,
        sizeClass,
        className,
      ].join(" ")}
    >
      {label}
    </Tag>
  );
}
