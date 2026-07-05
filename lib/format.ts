export function formatBaht(value: number): string {
  const rounded = Math.round(value);
  return "฿" + rounded.toLocaleString("en-US");
}

export function formatSignedBaht(value: number): string {
  const sign = value >= 0 ? "+" : "-";
  return sign + formatBaht(Math.abs(value));
}

export function formatPct(value: number, digits = 1): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function formatThaiDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("th-TH-u-ca-gregory", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
