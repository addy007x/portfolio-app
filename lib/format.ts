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

// Adds a time-of-day when the input has one ("YYYY-MM-DD" is exactly 10
// chars and has none); used for chart tooltips where sub-day precision
// matters (e.g. Earn's compounding curve within the same day).
export function formatThaiDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const datePart = formatThaiDate(iso);
  if (iso.length <= 10) return datePart;
  const timePart = d.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${datePart} ${timePart}`;
}
