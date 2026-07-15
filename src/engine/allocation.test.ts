import { describe, expect, it } from 'vitest';
import { incomeAllocation } from './allocation';
import type { MonthSummary } from './summarize';

/** A month summary with only the fields incomeAllocation reads. */
function summary(partial: Partial<MonthSummary>): MonthSummary {
  return {
    incomeHalere: 0,
    spendHalere: 0,
    savedHalere: 0,
    leftoverHalere: 0,
    byCategory: [],
    unclassifiedCount: 0,
    transferCount: 0,
    ...partial,
  };
}

describe('incomeAllocation', () => {
  it('splits income into three non-negative slices as shares of income', () => {
    // income 100 000; spent 50 000; saved 20 000; leftover 30 000.
    const a = incomeAllocation(
      summary({
        incomeHalere: 10_000_000,
        spendHalere: 5_000_000,
        savedHalere: 2_000_000,
        leftoverHalere: 3_000_000,
      }),
    );
    expect(a.status).toBe('ok');
    expect(a.slices.map((s) => s.key)).toEqual(['spent', 'saved', 'leftover']);
    expect(a.slices.map((s) => s.pct)).toEqual([50, 20, 30]);
    expect(a.slices[0].halere).toBe(5_000_000);
  });

  it('reports no-income when income is zero or negative', () => {
    expect(incomeAllocation(summary({ incomeHalere: 0 })).status).toBe('no-income');
    expect(incomeAllocation(summary({ incomeHalere: -100 })).status).toBe('no-income');
  });

  it('reports overspent (with a >100% figure) when leftover is negative', () => {
    // income 100 000; spent 104 000; saved 0; leftover -4 000.
    const a = incomeAllocation(
      summary({
        incomeHalere: 10_000_000,
        spendHalere: 10_400_000,
        savedHalere: 0,
        leftoverHalere: -400_000,
      }),
    );
    expect(a.status).toBe('overspent');
    expect(a.slices).toEqual([]);
    expect(a.overspentPct).toBeCloseTo(104, 5);
  });

  it('reports withdrawn when net savings are negative', () => {
    const a = incomeAllocation(
      summary({
        incomeHalere: 10_000_000,
        spendHalere: 4_000_000,
        savedHalere: -1_000_000,
        leftoverHalere: 7_000_000,
      }),
    );
    expect(a.status).toBe('withdrawn');
    expect(a.slices).toEqual([]);
  });

  it('keeps zero slices (they show in the legend at 0%) when the month is ok', () => {
    // income 100 000; all spent; saved 0; leftover 0.
    const a = incomeAllocation(
      summary({
        incomeHalere: 10_000_000,
        spendHalere: 10_000_000,
        savedHalere: 0,
        leftoverHalere: 0,
      }),
    );
    expect(a.status).toBe('ok');
    expect(a.slices).toHaveLength(3);
    expect(a.slices[1].pct).toBe(0);
    expect(a.slices[2].pct).toBe(0);
  });
});
