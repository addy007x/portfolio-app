export type ChartRange = "24H" | "1W" | "1M" | "3M" | "6M" | "1Y" | "ALL";

export const CHART_RANGES: ChartRange[] = ["24H", "1W", "1M", "3M", "6M", "1Y", "ALL"];

const RANGE_DAYS: Record<ChartRange, number | null> = {
  "24H": 1,
  "1W": 7,
  "1M": 30,
  "3M": 90,
  "6M": 182,
  "1Y": 365,
  ALL: null,
};

// undefined means "no cutoff" (the ALL range).
export function rangeStartDate(range: ChartRange, asOf: Date): Date | undefined {
  const days = RANGE_DAYS[range];
  if (days === null) return undefined;
  return new Date(asOf.getTime() - days * 86_400_000);
}
