// Mortgage amortization — pure functions over a MortgageLoan (see docs §4). Money
// is integer halere; time advances in whole calendar months. Each month the
// balance grows by one month's interest and then the fixed payment is applied:
//
//     balance = round(balance × (1 + annualRatePct/100/12)) − monthlyPayment
//
// floored at zero. Month 0 (the `principalAsOf` month) carries no payment; the
// first charge lands one calendar month later.

import type { IsoDate, MortgageLoan } from '../types/data';

interface YearMonthDay {
  year: number;
  month: number; // 1–12
  day: number;
}

function parseIso(iso: IsoDate): YearMonthDay {
  const [year, month, day] = iso.split('-').map(Number);
  return { year, month, day };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Whole calendar months from `from` to `to` (day-of-month ignored). */
function monthsBetween(from: IsoDate, to: IsoDate): number {
  const f = parseIso(from);
  const t = parseIso(to);
  return (t.year - f.year) * 12 + (t.month - f.month);
}

/** `iso` advanced by `n` calendar months, clamping the day to the month's end. */
function addMonths(iso: IsoDate, n: number): IsoDate {
  const { year, month, day } = parseIso(iso);
  const totalMonths = year * 12 + (month - 1) + n;
  const ny = Math.floor(totalMonths / 12);
  const nm = (totalMonths % 12) + 1;
  // Day 0 of the following month is the last day of month `nm`.
  const lastDay = new Date(ny, nm, 0).getDate();
  const nd = Math.min(day, lastDay);
  return `${ny}-${pad2(nm)}-${pad2(nd)}`;
}

function monthlyRate(loan: MortgageLoan): number {
  return loan.annualRatePct / 100 / 12;
}

interface MonthStep {
  balanceHalere: number;
  interestHalere: number;
  principalHalere: number;
}

/** Advance one month: accrue interest, apply the payment, floor at zero. */
function stepMonth(balance: number, rate: number, payment: number): MonthStep {
  const interestHalere = Math.round(balance * rate);
  const raw = balance + interestHalere - payment;
  const balanceHalere = raw < 0 ? 0 : raw;
  return {
    balanceHalere,
    interestHalere,
    // Principal actually retired this month (a payoff month pays less).
    principalHalere: balance - balanceHalere,
  };
}

/** Outstanding mortgage balance (halere) on `date`, per the amortization model. */
export function mortgageBalanceAt(loan: MortgageLoan, date: IsoDate): number {
  const months = Math.max(0, monthsBetween(loan.principalAsOf, date));
  const rate = monthlyRate(loan);
  let balance = loan.principalHalere;
  for (let m = 0; m < months; m++) {
    balance = stepMonth(balance, rate, loan.monthlyPaymentHalere).balanceHalere;
  }
  return balance;
}

export interface AmortizationRow {
  /** The calendar month this row lands on (`principalAsOf` + m months). */
  date: IsoDate;
  interestHalere: number;
  principalHalere: number;
  balanceHalere: number;
}

/**
 * Month-by-month amortization rows from the first payment month up to and
 * including `untilDate`. Empty if `untilDate` is not after `principalAsOf`.
 */
export function amortizationSchedule(
  loan: MortgageLoan,
  untilDate: IsoDate,
): AmortizationRow[] {
  const months = Math.max(0, monthsBetween(loan.principalAsOf, untilDate));
  const rate = monthlyRate(loan);
  const rows: AmortizationRow[] = [];
  let balance = loan.principalHalere;
  for (let m = 1; m <= months; m++) {
    const step = stepMonth(balance, rate, loan.monthlyPaymentHalere);
    balance = step.balanceHalere;
    rows.push({
      date: addMonths(loan.principalAsOf, m),
      interestHalere: step.interestHalere,
      principalHalere: step.principalHalere,
      balanceHalere: step.balanceHalere,
    });
  }
  return rows;
}
