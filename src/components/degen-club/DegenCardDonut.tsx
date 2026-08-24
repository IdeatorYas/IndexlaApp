/** Compact allocation ring for Degen marketplace cards — no overlapping segment labels. */

const NEON = [
  "#39ff14",
  "#ff00aa",
  "#ff6b2c",
  "#ffd700",
  "#a855f7",
  "#22d3ee",
  "#f472b6",
  "#84cc16",
  "#fb7185",
  "#38bdf8",
];

export function DegenCardDonut({
  segments,
  size = 72,
}: {
  segments: { percent: number }[];
  size?: number;
}) {
  const total = segments.reduce((sum, s) => sum + s.percent, 0) || 100;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 3;
  const innerR = outerR * 0.52;
  let cursor = -Math.PI / 2;

  const arcs = segments.map((seg, index) => {
    const sweep = (seg.percent / total) * Math.PI * 2;
    const start = cursor;
    const end = cursor + sweep;
    cursor = end;
    const x1 = cx + outerR * Math.cos(start);
    const y1 = cy + outerR * Math.sin(start);
    const x2 = cx + outerR * Math.cos(end);
    const y2 = cy + outerR * Math.sin(end);
    const xi1 = cx + innerR * Math.cos(end);
    const yi1 = cy + innerR * Math.sin(end);
    const xi2 = cx + innerR * Math.cos(start);
    const yi2 = cy + innerR * Math.sin(start);
    const large = sweep > Math.PI ? 1 : 0;
    const d = [
      `M ${x1} ${y1}`,
      `A ${outerR} ${outerR} 0 ${large} 1 ${x2} ${y2}`,
      `L ${xi1} ${yi1}`,
      `A ${innerR} ${innerR} 0 ${large} 0 ${xi2} ${yi2}`,
      "Z",
    ].join(" ");
    return { d, color: NEON[index % NEON.length], key: index };
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0 drop-shadow-[0_0_10px_rgba(168,85,247,0.35)]"
      aria-hidden
    >
      {arcs.map((arc) => (
        <path
          key={arc.key}
          d={arc.d}
          fill={arc.color}
          stroke="rgba(6,4,12,0.85)"
          strokeWidth="1"
        />
      ))}
      <circle cx={cx} cy={cy} r={innerR - 1} fill="#0e0818" />
      <text
        x={cx}
        y={cy - 1}
        textAnchor="middle"
        fill="#f4f0ff"
        style={{ fontSize: 11, fontWeight: 800 }}
      >
        {segments.length}
      </text>
      <text
        x={cx}
        y={cy + 10}
        textAnchor="middle"
        fill="rgba(212,196,255,0.7)"
        style={{ fontSize: 7, fontWeight: 700 }}
      >
        assets
      </text>
    </svg>
  );
}
