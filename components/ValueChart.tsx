"use client";

import { useRef, useState } from "react";
import type { ValueSnapshot } from "@/lib/types";
import { formatThaiDate, formatThaiDateTime } from "@/lib/format";

export function ValueChart({
  points,
  formatMoney,
  emptyMessage = "กราฟจะเริ่มแสดงหลังเปิดแอปทิ้งไว้ครบ 2 วันขึ้นไป (บันทึกมูลค่าพอร์ตวันละครั้ง)",
}: {
  points: ValueSnapshot[];
  formatMoney: (value: number) => string;
  emptyMessage?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  if (points.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-xs text-center px-4"
        style={{ height: 120, color: "var(--muted)" }}
      >
        {emptyMessage}
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

  function updateActiveFromPointer(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return;
    const localX = ((e.clientX - rect.left) / rect.width) * w;
    const idx = Math.max(0, Math.min(points.length - 1, Math.round(localX / stepX)));
    setActiveIdx(idx);
  }

  function clearActive() {
    setActiveIdx(null);
  }

  const active = activeIdx !== null ? points[activeIdx] : null;
  const activeCoord = activeIdx !== null ? coords[activeIdx] : null;
  const tooltipLeftPct = activeCoord
    ? Math.min(78, Math.max(22, (activeCoord[0] / w) * 100))
    : 50;

  return (
    <div style={{ marginTop: 10 }}>
      <div className="relative" style={{ height: 120 }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          style={{ width: "100%", height: 120, display: "block", touchAction: "none" }}
          onPointerDown={updateActiveFromPointer}
          onPointerMove={(e) => {
            if (e.buttons === 1 || e.pointerType === "touch") updateActiveFromPointer(e);
          }}
          onPointerUp={clearActive}
          onPointerLeave={clearActive}
          onPointerCancel={clearActive}
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
          {activeCoord && (
            <>
              <line
                x1={activeCoord[0]}
                y1={0}
                x2={activeCoord[0]}
                y2={h}
                stroke="var(--muted)"
                strokeWidth={1}
                strokeDasharray="3,3"
                opacity={0.5}
              />
              <circle
                cx={activeCoord[0]}
                cy={activeCoord[1]}
                r={4.5}
                fill="var(--accent)"
                stroke="var(--bg)"
                strokeWidth={1.5}
              />
            </>
          )}
        </svg>

        {!active && (
          <>
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
          </>
        )}

        {active && (
          <div
            className="absolute rounded-[10px] px-2.5 py-1.5 pointer-events-none"
            style={{
              left: `${tooltipLeftPct}%`,
              top: 0,
              transform: "translate(-50%, 0)",
              background: "var(--surface2)",
              border: "var(--card-border)",
              whiteSpace: "nowrap",
              zIndex: 10,
            }}
          >
            <div className="text-[10px]" style={{ color: "var(--muted)" }}>
              {formatThaiDateTime(active.date)}
            </div>
            <div className="text-xs font-bold" style={{ color: "var(--accent)" }}>
              {formatMoney(active.totalValue)}
            </div>
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
