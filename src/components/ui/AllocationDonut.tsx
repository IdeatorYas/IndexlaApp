const COLORS = ["#6366f1", "#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6"];

export function AllocationDonut({
  segments,
  size = 56,
}: {
  segments: { label: string; percent: number }[];
  size?: number;
}) {
  const total = segments.reduce((sum, s) => sum + s.percent, 0) || 100;
  let offset = 0;
  const radius = size / 2 - 4;
  const circumference = 2 * Math.PI * radius;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
      aria-hidden
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--color-panel)"
        strokeWidth="8"
      />
      {segments.map((segment, index) => {
        const length = (segment.percent / total) * circumference;
        const dasharray = `${length} ${circumference - length}`;
        const dashoffset = -offset;
        offset += length;
        return (
          <circle
            key={segment.label}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={COLORS[index % COLORS.length]}
            strokeWidth="8"
            strokeDasharray={dasharray}
            strokeDashoffset={dashoffset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        );
      })}
    </svg>
  );
}
