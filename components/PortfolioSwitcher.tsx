"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Card";
import { usePortfolios } from "@/lib/portfolioContext";

export function PortfolioSwitcher() {
  const { portfolios, currentPortfolioId, setCurrentPortfolioId } = usePortfolios();
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

  if (portfolios.length === 0) return null;
  const current = portfolios.find((p) => p.id === currentPortfolioId) ?? portfolios[0];

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-[10px] px-2.5 py-1 text-xs font-bold"
        style={{ background: "var(--surface2)", color: "var(--text)", maxWidth: 160 }}
      >
        <span className="truncate">{current.name}</span>
        <Icon name={open ? "expand_less" : "expand_more"} style={{ fontSize: 16, flexShrink: 0 }} />
      </button>
      {open && (
        <div
          className="absolute left-0 mt-1 rounded-[12px] overflow-hidden"
          style={{
            background: "var(--surface2)",
            border: "var(--card-border)",
            minWidth: 160,
            zIndex: 20,
          }}
        >
          {portfolios.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setCurrentPortfolioId(p.id);
                setOpen(false);
              }}
              className="block w-full text-left px-3 py-2 text-xs font-semibold truncate"
              style={{ color: p.id === current.id ? "var(--accent)" : "var(--text)" }}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
