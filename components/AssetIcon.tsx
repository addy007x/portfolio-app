"use client";

import { useState } from "react";
import { Icon } from "@/components/Card";
import type { AssetClass } from "@/lib/types";
import { ASSET_CLASS_COLOR, ASSET_CLASS_ICON } from "@/lib/types";

// Financial Modeling Prep's public per-ticker logo endpoint. No API key
// needed for this path; falls back to the Material icon on 404 for
// tickers it doesn't recognize (e.g. Thai stocks).
function stockLogoUrl(symbol: string) {
  return `https://financialmodelingprep.com/image-stock/${symbol.toUpperCase()}.png`;
}

export function AssetIcon({
  symbol,
  assetClass,
  iconUrl,
  size = 19,
}: {
  symbol: string;
  assetClass: AssetClass;
  iconUrl?: string;
  size?: number;
}) {
  const [broken, setBroken] = useState(false);
  const canTryWebLogo = assetClass === "foreign_stock" || assetClass === "etf" || assetClass === "th_stock";
  const src = iconUrl ?? (canTryWebLogo && !broken ? stockLogoUrl(symbol) : null);

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={symbol}
        className="w-5 h-5"
        onError={() => setBroken(true)}
      />
    );
  }

  return (
    <Icon
      name={ASSET_CLASS_ICON[assetClass]}
      style={{ fontSize: size, color: ASSET_CLASS_COLOR[assetClass] }}
    />
  );
}
