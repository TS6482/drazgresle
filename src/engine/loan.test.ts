import { describe, expect, it } from 'vitest';
import { amortizationSchedule, mortgageBalanceAt } from './loan';
import type { MortgageLoan } from '../types/data';

// Hand-computed reference loan: 1 000 000 halere, 12% p.a. → 1% per month,
// payment 50 000 halere, as of 2026-01-15.
//   Month 1: round(1 000 000 × 1.01) − 50 000 = 1 010 000 − 50 000 = 960 000
//   Month 2: round(  960 000 × 1.01) − 50 000 =   969 600 − 50 000 = 919 600
//   Month 3: round(  919 600 × 1.01) − 50 000 =   928 796 − 50 000 = 878 796
const loan: MortgageLoan = {
  principalHalere: 1_000_000,
  principalAsOf: '2026-01-15',
  annualRatePct: 12,
  monthlyPaymentHalere: 50_000,
  fixationEnd: '2030-01-15',
};

describe('mortgageBalanceAt', () => {
  it('returns the principal at (or before) the as-of date — no payment in month 0', () => {
    expect(mortgageBalanceAt(loan, '2026-01-15')).toBe(1_000_000);
    expect(mortgageBalanceAt(loan, '2025-12-31')).toBe(1_000_000); // before start clamps to 0 months
  });

  it('matches the hand-computed 1- to 3-month balances', () => {
    expect(mortgageBalanceAt(loan, '2026-02-20')).toBe(960_000); // 1 month
    expect(mortgageBalanceAt(loan, '2026-03-01')).toBe(919_600); // 2 months
    expect(mortgageBalanceAt(loan, '2026-04-30')).toBe(878_796); // 3 months
  });

  it('handles a zero-rate loan (payment is pure principal)', () => {
    // 1 000 000, 0%, pay 50 000/mo → 950 000, 900 000, 850 000
    const zero: MortgageLoan = { ...loan, annualRatePct: 0 };
    expect(mortgageBalanceAt(zero, '2026-02-01')).toBe(950_000);
    expect(mortgageBalanceAt(zero, '2026-04-01')).toBe(850_000); // 3 months
  });

  it('floors a paid-off loan at zero (payoff before the given date)', () => {
    // 100 000, 0%, pay 60 000/mo → M1 40 000, M2 0 (−20 000 floored), M3 stays 0
    const payoff: MortgageLoan = {
      ...loan,
      principalHalere: 100_000,
      annualRatePct: 0,
      monthlyPaymentHalere: 60_000,
    };
    expect(mortgageBalanceAt(payoff, '2026-02-15')).toBe(40_000);
    expect(mortgageBalanceAt(payoff, '2026-03-15')).toBe(0);
    expect(mortgageBalanceAt(payoff, '2026-06-15')).toBe(0);
  });

  it('rounds interest to whole halere each month', () => {
    // 100 005, 3% p.a. → 0.25%/mo, no payment.
    //   M1: round(100 005 × 1.0025) = round(100 255.0125) = 100 255
    //   M2: round(100 255 × 1.0025) = round(100 505.6375) = 100 506
    const rounding: MortgageLoan = {
      ...loan,
      principalHalere: 100_005,
      annualRatePct: 3,
      monthlyPaymentHalere: 0,
    };
    expect(mortgageBalanceAt(rounding, '2026-02-15')).toBe(100_255);
    expect(mortgageBalanceAt(rounding, '2026-03-15')).toBe(100_506);
  });
});

describe('amortizationSchedule', () => {
  it('is empty when the end date is not after the start', () => {
    expect(amortizationSchedule(loan, '2026-01-15')).toEqual([]);
    expect(amortizationSchedule(loan, '2025-06-01')).toEqual([]);
  });

  it('splits each payment into interest and principal (hand-computed)', () => {
    const rows = amortizationSchedule(loan, '2026-03-31'); // 2 months
    expect(rows).toHaveLength(2);
    // Month 1: interest 10 000, principal 40 000, balance 960 000
    expect(rows[0]).toEqual({
      date: '2026-02-15',
      interestHalere: 10_000,
      principalHalere: 40_000,
      balanceHalere: 960_000,
    });
    // Month 2: interest 9 600, principal 40 400, balance 919 600
    expect(rows[1]).toEqual({
      date: '2026-03-15',
      interestHalere: 9_600,
      principalHalere: 40_400,
      balanceHalere: 919_600,
    });
    // Interest + principal reconstructs the fixed payment.
    expect(rows[0].interestHalere + rows[0].principalHalere).toBe(50_000);
    expect(rows[1].interestHalere + rows[1].principalHalere).toBe(50_000);
  });

  it('clamps the day when advancing past a short month', () => {
    // Start Jan 31 → Feb has no 31st, so the row clamps to Feb 28.
    const janEnd: MortgageLoan = { ...loan, principalAsOf: '2026-01-31' };
    const rows = amortizationSchedule(janEnd, '2026-02-28');
    expect(rows[0].date).toBe('2026-02-28');
  });

  it('shows a zeroed final month once the loan is paid off', () => {
    const payoff: MortgageLoan = {
      ...loan,
      principalHalere: 100_000,
      annualRatePct: 0,
      monthlyPaymentHalere: 60_000,
    };
    const rows = amortizationSchedule(payoff, '2026-04-15'); // 3 months
    expect(rows[1].balanceHalere).toBe(0); // paid off in month 2
    expect(rows[2]).toEqual({
      date: '2026-04-15',
      interestHalere: 0,
      principalHalere: 0,
      balanceHalere: 0,
    });
  });
});
