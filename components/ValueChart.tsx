"use client";

import type { ValueSnapshot } from "@/lib/types";
import { formatThaiDate } from "@/lib/format";

export function ValueChart({
  points,
  formatMoney,
}: {
  points: ValueSnapshot[];
  formatMoney: (value: number) => string;
}) {
  if (points.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-xs text-center px-4"
        style={{ height: 120, color: "var(--muted)" }}
      >
        กราฟจะเริ่มแสดงหลังเปิดแอปทิ้งไว้ครบ 2 วันขึ้นไป (บันทึกมูลค่าพอร์ตวันละครั้ง)
      </div>
    );
  }

  const w = 320;
  const h = 130;
  const values = points.map((p) => p.totalValue);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = w / (points.length - 1);

  const coords = points.map((p, i) => {
    const x = i * stepX;
    const y = 10 + (1 - (p.totalValue - min) / range) * 100;
    return [x, y];
  });

  const line = coords.map(([x, y]) => `${x},${y}`).join(" ");
  const polygon = `4,118 ${line} ${w - 4},130 4,130`;
  const maxIdx = values.indexOf(max);
  const minIdx = values.indexOf(min);

  return (
    <div style={{ marginTop: 10 }}>
      <div className="relative" style={{ height: 120 }}>
        <svg
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          style={{ width: "100%", height: 120, display: "block" }}
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
        <div
          className="absolute text-[10px] font-bold"
          style={{
            left: `${(coords[maxIdx][0] / w) * 100}%`,
            top: `${(coords[maxIdx][1] / h) * 100}%`,
            transform: "translate(-50%, -130%)",
            color: "var(--up)",
            whiteSpace: "nowrap",
          }}
        >
          {formatMoney(max)}
        </div>
        {minIdx !== maxIdx && (
          <div
            className="absolute text-[10px] font-bold"
            style={{
              left: `${(coords[minIdx][0] / w) * 100}%`,
              top: `${(coords[minIdx][1] / h) * 100}%`,
              transform: "translate(-50%, 30%)",
              color: "var(--muted)",
              whiteSpace: "nowrap",
            }}
          >
            {formatMoney(min)}
          </div>
        )}
      </div>
      <div className="flex justify-between text-[10px] mt-1" style={{ color: "var(--muted)" }}>
        <span>{formatThaiDate(points[0].date)}</span>
        <span>{formatThaiDate(points[points.length - 1].date)}</span>
      </div>
    </div>
  );
}
