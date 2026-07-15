// Family-loan repayment progress — a pure function over the outstanding balance
// and the {year: halere} repayment plan (see docs §4a). Money is integer halere.
// Interest-free: each planned lump sum reduces the balance one-to-one; a payment
// larger than what is still owed counts only the part actually needed, and the
// remainder never goes below zero.

/** One year of the plan, with the balance still owed after that year's payment. */
export interface PlanProgressRow {
  /** Calendar year (4-digit string key from the plan). */
  year: string;
  /** Amount actually applied this year, in halere (capped at the remaining debt). */
  paymentHalere: number;
  /** Balance still owed after this year, in halere (floored at 0). */
  remainderHalere: number;
}

export interface PlanProgressSummary {
  /** First year the remainder reaches 0, or null if never within the plan. */
  paidOffYear: string | null;
  /** Balance still owed after the last planned year, in halere (0 if paid off). */
  shortfallHalere: number;
}

export interface PlanProgress {
  /** One row per planned year, ordered by year ascending. */
  rows: PlanProgressRow[];
  summary: PlanProgressSummary;
}

/**
 * Walk the repayment plan year by year (ascending) from `outstandingHalere`,
 * reporting the running remainder after each payment plus a summary. Unsorted
 * plan keys are handled — years are sorted before walking. An empty plan yields
 * no rows and a shortfall equal to the full outstanding balance.
 */
export function planProgress(
  outstandingHalere: number,
  plan: Record<string, number>,
): PlanProgress {
  const years = Object.keys(plan).sort((a, b) => a.localeCompare(b));

  let remainder = Math.max(0, outstandingHalere);
  let paidOffYear: string | null = null;
  const rows: PlanProgressRow[] = [];

  for (const year of years) {
    // A payment larger than the remaining debt counts only the needed part;
    // a negative planned figure is treated as no payment.
    const applied = Math.max(0, Math.min(plan[year], remainder));
    remainder -= applied;
    rows.push({ year, paymentHalere: applied, remainderHalere: remainder });
    if (paidOffYear === null && remainder === 0) {
      paidOffYear = year;
    }
  }

  return { rows, summary: { paidOffYear, shortfallHalere: remainder } };
}
