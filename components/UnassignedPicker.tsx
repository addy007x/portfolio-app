"use client";

import { AssetIcon } from "@/components/AssetIcon";
import { assetClassLabel } from "@/lib/types";
import type { Holding } from "@/lib/types";
import { useLanguage } from "@/lib/i18n";

// Lets the user pick from holdings that exist but aren't in any portfolio
// right now (removed from one, not yet placed in another), instead of
// retyping a ticker that's guaranteed to hit the one-portfolio-per-symbol
// conflict check.
export function UnassignedPicker({
  holdings,
  onPick,
}: {
  holdings: Holding[];
  onPick: (h: Holding) => void;
}) {
  const { t, language } = useLanguage();
  if (holdings.length === 0) return null;

  return (
    <div>
      <div className="text-xs font-semibold mb-1.5" style={{ color: "var(--muted)" }}>
        {t("picker.chooseFromRemoved")}
      </div>
      <div className="flex flex-col gap-1.5">
        {holdings.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => onPick(h)}
            className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left"
            style={{ background: "var(--surface2)" }}
          >
            <div
              className="w-7 h-7 rounded-[9px] flex items-center justify-center flex-none overflow-hidden"
              style={{ background: "var(--surface)" }}
            >
              <AssetIcon symbol={h.symbol} assetClass={h.assetClass} iconUrl={h.iconUrl} size={15} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold truncate">{h.symbol}</div>
              <div className="text-[10px] truncate" style={{ color: "var(--muted)" }}>
                {assetClassLabel(h.assetClass, language)}
              </div>
            </div>
          </button>
        ))}
      </div>
      <div className="text-[11px] mt-2" style={{ color: "var(--muted)" }}>
        {t("picker.orTypeNewTicker")}
      </div>
    </div>
  );
}
