import type { InvestPlanItem } from "@/lib/types";

export interface DcaPaceRow {
  symbol: string;
  pct: number;
  target: number; // full-year allocation for this asset
  invested: number; // already put in this year
  remaining: number; // still to invest, never negative
  // Even pace to finish by 31 Dec, at each contribution frequency.
  perMonth: number;
  perWeek: number;
  perDay: number;
  // What should have been invested by now if the year's budget were spread
  // evenly. Lets the UI say "ahead" or "behind" rather than only "remaining".
  expectedByNow: number;
  behind: number; // expectedByNow - invested, never negative
  done: boolean;
}

export interface DcaSchedule {
  // Whole months left including the current one, so "invest this much each
  // month" includes the month you're standing in rather than assuming it's
  // already gone.
  monthsLeft: number;
  weeksLeft: number;
  daysLeft: number;
  yearElapsedPct: number;
  totalTarget: number;
  totalInvested: number;
  totalRemaining: number;
  totalPerMonth: number;
  totalPerWeek: number;
  totalPerDay: number;
  totalBehind: number;
  rows: DcaPaceRow[];
  // True once the plan year has passed — nothing left to pace.
  yearOver: boolean;
}

// Months remaining in `year` counting the current one, given `now`.
// A future year still has all 12; a past year has none.
function monthsRemaining(year: number, now: Date): number {
  if (year > now.getFullYear()) return 12;
  if (year < now.getFullYear()) return 0;
  return 12 - now.getMonth();
}

// How far through the plan year we are, 0-100. Used for the pace comparison
// rather than month counting, so being three weeks into a month isn't
// treated the same as being one day into it.
function elapsedPct(year: number, now: Date): number {
  if (year > now.getFullYear()) return 0;
  if (year < now.getFullYear()) return 100;
  const start = new Date(year, 0, 1).getTime();
  const end = new Date(year + 1, 0, 1).getTime();
  return ((now.getTime() - start) / (end - start)) * 100;
}

/**
 * Works out what still needs to be invested in each asset, and at what pace,
 * to finish the year's plan by 31 December.
 *
 * @param budget    total to invest across the whole year
 * @param items     the plan's allocation, percentages of that budget
 * @param investedBySymbol  already invested this year, keyed by upper-case symbol
 * @param year      the plan's calendar year (not Buddhist era)
 */
export function computeDcaSchedule(
  budget: number,
  items: InvestPlanItem[],
  investedBySymbol: Record<string, number>,
  year: number,
  now: Date = new Date()
): DcaSchedule {
  const monthsLeft = monthsRemaining(year, now);
  const yearElapsed = elapsedPct(year, now);
  const yearOver = monthsLeft === 0;

  // Days rather than months/4, so the weekly figure doesn't drift from the
  // monthly one late in the year.
  const endOfYear = new Date(year + 1, 0, 1).getTime();
  const daysLeft = Math.max(0, (endOfYear - now.getTime()) / 86_400_000);
  const weeksLeft = daysLeft / 7;

  const rows: DcaPaceRow[] = items.map((item) => {
    const symbol = item.symbol.toUpperCase();
    const target = (budget * item.pct) / 100;
    const invested = investedBySymbol[symbol] ?? 0;
    // Overshooting an asset doesn't create a negative requirement — it just
    // means nothing more is needed there.
    const remaining = Math.max(0, target - invested);
    const expectedByNow = (target * yearElapsed) / 100;

    return {
      symbol,
      pct: item.pct,
      target,
      invested,
      remaining,
      perMonth: monthsLeft > 0 ? remaining / monthsLeft : 0,
      perWeek: weeksLeft > 0 ? remaining / weeksLeft : 0,
      perDay: daysLeft > 0 ? remaining / daysLeft : 0,
      expectedByNow,
      behind: Math.max(0, expectedByNow - invested),
      done: target > 0 && remaining <= 0,
    };
  });

  const totalTarget = rows.reduce((s, r) => s + r.target, 0);
  const totalRemaining = rows.reduce((s, r) => s + r.remaining, 0);

  return {
    monthsLeft,
    weeksLeft,
    daysLeft,
    yearElapsedPct: yearElapsed,
    totalTarget,
    // Summed from the rows rather than every buy this year, so money spent
    // on something outside the plan isn't counted as plan progress.
    totalInvested: rows.reduce((s, r) => s + r.invested, 0),
    totalRemaining,
    totalPerMonth: monthsLeft > 0 ? totalRemaining / monthsLeft : 0,
    totalPerWeek: weeksLeft > 0 ? totalRemaining / weeksLeft : 0,
    totalPerDay: daysLeft > 0 ? totalRemaining / daysLeft : 0,
    totalBehind: rows.reduce((s, r) => s + r.behind, 0),
    rows,
    yearOver,
  };
}
