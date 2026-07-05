"use client";

import type { AllocationSlice } from "@/lib/firestore";

export function Donut({
  slices,
  size = 130,
}: {
  slices: AllocationSlice[];
  size?: number;
}) {
  const r = 60;
  const C = 2 * Math.PI * r;

  if (slices.length === 0) {
    return (
      <svg viewBox="0 0 160 160" style={{ width: size, height: size }}>
        <circle
          cx={80}
          cy={80}
          r={r}
          fill="none"
          stroke="var(--surface2)"
          strokeWidth={22}
        />
      </svg>
    );
  }

  const arcs = slices.reduce<Array<{ color: string; len: number; offset: number }>>(
    (acc, s) => {
      const len = (s.pct / 100) * C;
      const prevOffset = acc.length > 0 ? acc[acc.length - 1].offset + acc[acc.length - 1].len : 0;
      return [...acc, { color: s.color, len, offset: prevOffset }];
    },
    []
  );

  return (
    <svg viewBox="0 0 160 160" style={{ width: size, height: size }}>
      <g transform="rotate(-90 80 80)">
        {arcs.map((a, i) => (
          <circle
            key={i}
            cx={80}
            cy={80}
            r={r}
            fill="none"
            stroke={a.color}
            strokeWidth={22}
            strokeDasharray={`${a.len} ${C - a.len}`}
            strokeDashoffset={-a.offset}
            strokeLinecap="butt"
          />
        ))}
      </g>
    </svg>
  );
}
