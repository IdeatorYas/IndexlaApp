const ILLUSTRATIVE_TIMESTAMP = "2026-08-22T16:00:00.000Z";

function series(base: number, points: number, drift: number) {
  const out: { t: string; v: number }[] = [];
  const start = new Date(ILLUSTRATIVE_TIMESTAMP);
  for (let i = points - 1; i >= 0; i -= 1) {
    const d = new Date(start);
    d.setDate(d.getDate() - i);
    out.push({
      t: d.toISOString().slice(0, 10),
      v: Math.round(base + drift * (points - i) + Math.sin(i) * base * 0.02),
    });
  }
  return out;
}

export { ILLUSTRATIVE_TIMESTAMP };

export function getIllustrativeChartSeries(baseValue: number) {
  return {
    "7d": series(baseValue, 7, baseValue * 0.004),
    "30d": series(baseValue * 0.92, 30, baseValue * 0.001),
    "90d": series(baseValue * 0.85, 90, baseValue * 0.0006),
    "1y": series(baseValue * 0.72, 52, baseValue * 0.0004),
  };
}
