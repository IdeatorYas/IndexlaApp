"use client";

export function MiniLineChart({
  points,
  height = 120,
}: {
  points: { t: string; v: number }[];
  height?: number;
}) {
  if (points.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-xl bg-app-panel text-xs text-app-dim"
        style={{ height }}
      >
        No chart data
      </div>
    );
  }

  const width = 100;
  const values = points.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const coords = points.map((point, index) => {
    const x = (index / (points.length - 1)) * width;
    const y = height - ((point.v - min) / range) * (height - 10) - 5;
    return `${x},${y}`;
  });

  const areaCoords = `0,${height} ${coords.join(" ")} ${width},${height}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-full w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label="Portfolio value chart"
    >
      <defs>
        <linearGradient id="dashChartFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--chart-stroke)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--chart-stroke)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaCoords} fill="url(#dashChartFill)" />
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke="var(--chart-stroke)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
