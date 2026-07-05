"use client";

export function ValueChart({ points }: { points: number[] }) {
  if (points.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-xs"
        style={{ height: 120, color: "var(--muted)" }}
      >
        ยังไม่มีข้อมูลเพียงพอสำหรับกราฟ
      </div>
    );
  }

  const w = 320;
  const h = 130;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = w / (points.length - 1);

  const coords = points.map((v, i) => {
    const x = i * stepX;
    const y = 10 + (1 - (v - min) / range) * 100;
    return [x, y];
  });

  const line = coords.map(([x, y]) => `${x},${y}`).join(" ");
  const polygon = `4,118 ${line} ${w - 4},130 4,130`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height: 120, display: "block", marginTop: 10 }}
    >
      <polygon points={polygon} fill="var(--chart-fill)" />
      <polyline
        points={line}
        fill="none"
        stroke="var(--chart-line)"
        strokeWidth={2.6}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
