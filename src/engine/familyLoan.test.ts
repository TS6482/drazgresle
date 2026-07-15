import { describe, expect, it } from 'vitest';
import { planProgress } from './familyLoan';

describe('planProgress', () => {
  it('walks an exact payoff to a zero remainder', () => {
    const result = planProgress(300_000, { '2026': 150_000, '2027': 150_000 });
    expect(result.rows).toEqual([
      { year: '2026', paymentHalere: 150_000, remainderHalere: 150_000 },
      { year: '2027', paymentHalere: 150_000, remainderHalere: 0 },
    ]);
    expect(result.summary).toEqual({ paidOffYear: '2027', shortfallHalere: 0 });
  });

  it('caps an overpaying year to the remaining debt', () => {
    const result = planProgress(150_000, { '2026': 200_000, '2027': 100_000 });
    expect(result.rows).toEqual([
      { year: '2026', paymentHalere: 150_000, remainderHalere: 0 },
      { year: '2027', paymentHalere: 0, remainderHalere: 0 },
    ]);
    expect(result.summary).toEqual({ paidOffYear: '2026', shortfallHalere: 0 });
  });

  it('reports a shortfall when the plan does not cover the balance', () => {
    const result = planProgress(500_000, { '2026': 150_000, '2027': 170_000 });
    expect(result.rows).toEqual([
      { year: '2026', paymentHalere: 150_000, remainderHalere: 350_000 },
      { year: '2027', paymentHalere: 170_000, remainderHalere: 180_000 },
    ]);
    expect(result.summary).toEqual({ paidOffYear: null, shortfallHalere: 180_000 });
  });

  it('handles an empty plan (whole balance is the shortfall)', () => {
    const result = planProgress(400_000, {});
    expect(result.rows).toEqual([]);
    expect(result.summary).toEqual({ paidOffYear: null, shortfallHalere: 400_000 });
  });

  it('sorts unsorted plan years before walking', () => {
    const result = planProgress(300_000, { '2028': 100_000, '2026': 150_000, '2027': 100_000 });
    expect(result.rows.map((r) => r.year)).toEqual(['2026', '2027', '2028']);
    expect(result.rows).toEqual([
      { year: '2026', paymentHalere: 150_000, remainderHalere: 150_000 },
      { year: '2027', paymentHalere: 100_000, remainderHalere: 50_000 },
      { year: '2028', paymentHalere: 50_000, remainderHalere: 0 },
    ]);
    expect(result.summary).toEqual({ paidOffYear: '2028', shortfallHalere: 0 });
  });
});
