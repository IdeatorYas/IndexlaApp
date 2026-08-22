export function CreatorAvatar({
  initials,
  hue,
  size = 40,
}: {
  initials: string;
  hue: number;
  size?: number;
}) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(145deg, hsl(${hue} 55% 42%), hsl(${(hue + 40) % 360} 50% 28%))`,
      }}
      aria-hidden
    >
      {initials}
    </div>
  );
}
