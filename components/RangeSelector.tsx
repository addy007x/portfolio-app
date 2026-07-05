"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Card";
import { CHART_RANGES, type ChartRange } from "@/lib/chartRange";

export function RangeSelector({
  value,
  onChange,
}: {
  value: ChartRange;
  onChange: (r: ChartRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-0.5 rounded-[9px] px-2 py-1 text-xs font-semibold"
        style={{ background: "var(--surface2)", color: "var(--text)" }}
      >
        {value}
        <Icon name={open ? "expand_less" : "expand_more"} style={{ fontSize: 16 }} />
      </button>
      {open && (
        <div
          className="absolute right-0 mt-1 rounded-[12px] overflow-hidden"
          style={{
            background: "var(--surface2)",
            border: "var(--card-border)",
            minWidth: 84,
            zIndex: 20,
          }}
        >
          {CHART_RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => {
                onChange(r);
                setOpen(false);
              }}
              className="block w-full text-left px-3 py-2 text-xs font-semibold"
              style={{ color: r === value ? "var(--accent)" : "var(--text)" }}
            >
              {r}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
