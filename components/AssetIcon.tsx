"use client";

import { useState } from "react";
import { Icon } from "@/components/Card";
import type { AssetClass } from "@/lib/types";
import { ASSET_CLASS_COLOR, ASSET_CLASS_ICON } from "@/lib/types";

// Financial Modeling Prep's public per-ticker logo endpoint. No API key
// needed for this path. Thai stocks are listed there under their Yahoo-style
// ".BK" suffix (PTT.BK.png works, PTT.png 404s).
function stockLogoUrl(symbol: string) {
  return `https://financialmodelingprep.com/image-stock/${symbol}.png`;
}

// Static community icon set covering ~400 coins — used when a holding has
// no CoinGecko iconUrl stored yet (e.g. Earn rows before the first price
// sync), so different coins never collapse into the same generic ₿ glyph.
function cryptoFallbackUrl(symbol: string) {
  return `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@0.18.1/128/color/${symbol.toLowerCase()}.png`;
}

// URLs that already 404'd once this session — shared across every AssetIcon
// instance so each broken logo is only attempted once, not once per row.
const brokenUrls = new Set<string>();

function candidateUrls(symbol: string, assetClass: AssetClass, iconUrl?: string): string[] {
  const list: string[] = [];
  if (iconUrl) list.push(iconUrl);
  const sym = symbol.toUpperCase();
  if (assetClass === "th_stock") {
    list.push(stockLogoUrl(sym.endsWith(".BK") ? sym : `${sym}.BK`));
  } else if (assetClass === "foreign_stock" || assetClass === "etf") {
    list.push(stockLogoUrl(sym));
  } else if (assetClass === "crypto") {
    list.push(cryptoFallbackUrl(sym));
  }
  return list;
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
  // Only used to re-render after marking a URL broken; the actual state
  // lives in the module-level set so it survives remounts and is shared.
  const [, setFailedCount] = useState(0);
  const src = candidateUrls(symbol, assetClass, iconUrl).find((u) => !brokenUrls.has(u));

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={symbol}
        className="w-5 h-5"
        style={{ objectFit: "contain" }}
        onError={() => {
          brokenUrls.add(src);
          setFailedCount((n) => n + 1);
        }}
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
