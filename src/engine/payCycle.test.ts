import { describe, expect, it } from 'vitest';
import type { Transaction } from '../types/data';
import { payCycleLabelRange, payCycleRange, payCycleTransactions } from './payCycle';

/** An obviously-invented transaction fixture — only id and date matter here. */
function tx(id: string, date: string): Transaction {
  return {
    id,
    date,
    amountHalere: -12345,
    counterparty: 'Invented Vendor',
    description: 'test row',
    account: '',
    categoryId: null,
    source: 'manual',
  };
}

describe('payCycleRange', () => {
  it('spans start day to the same day next month (mid-year)', () => {
    expect(payCycleRange('2026-07', 10)).toEqual({
      start: '2026-07-10',
      endExclusive: '2026-08-10',
    });
  });

  it('handles year rollover (December → January)', () => {
    expect(payCycleRange('2026-12', 10)).toEqual({
      start: '2026-12-10',
      endExclusive: '2027-01-10',
    });
  });

  it('zero-pads a single-digit start day', () => {
    expect(payCycleRange('2026-03', 5)).toEqual({
      start: '2026-03-05',
      endExclusive: '2026-04-05',
    });
  });

  it('degenerates to the calendar month when startDay is 1', () => {
    expect(payCycleRange('2026-07', 1)).toEqual({
      start: '2026-07-01',
      endExclusive: '2026-08-01',
    });
  });
});

describe('payCycleTransactions', () => {
  const months: Record<string, Transaction[]> = {
    '2026-07': [
      tx('jul-early', '2026-07-09'), // before startDay → previous cycle, excluded
      tx('jul-boundary', '2026-07-10'), // exactly startDay → included
      tx('jul-late', '2026-07-25'), // after startDay → included
    ],
    '2026-08': [
      tx('aug-early', '2026-08-09'), // before startDay → included
      tx('aug-boundary', '2026-08-10'), // exactly startDay → next cycle, excluded
      tx('aug-late', '2026-08-20'), // after startDay → excluded
    ],
  };

  it('takes label-month rows on/after startDay and next-month rows before startDay', () => {
    const ids = payCycleTransactions(months, '2026-07', 10)
      .map((t) => t.id)
      .sort();
    expect(ids).toEqual(['aug-early', 'jul-boundary', 'jul-late']);
  });

  it('excludes label-month rows before startDay (they belong to the previous cycle)', () => {
    const ids = payCycleTransactions(months, '2026-07', 10).map((t) => t.id);
    expect(ids).not.toContain('jul-early');
  });

  it('excludes next-month rows on/after startDay (they belong to the next cycle)', () => {
    const ids = payCycleTransactions(months, '2026-07', 10).map((t) => t.id);
    expect(ids).not.toContain('aug-boundary');
    expect(ids).not.toContain('aug-late');
  });

  it('tolerates a missing label month (undefined → empty)', () => {
    const ids = payCycleTransactions({ '2026-08': months['2026-08'] }, '2026-07', 10).map(
      (t) => t.id,
    );
    expect(ids).toEqual(['aug-early']);
  });

  it('tolerates a missing next month (undefined → empty)', () => {
    const ids = payCycleTransactions({ '2026-07': months['2026-07'] }, '2026-07', 10)
      .map((t) => t.id)
      .sort();
    expect(ids).toEqual(['jul-boundary', 'jul-late']);
  });

  it('returns nothing when both months are absent', () => {
    expect(payCycleTransactions({}, '2026-07', 10)).toEqual([]);
  });

  it('equals exactly the calendar label month when startDay is 1', () => {
    const only: Record<string, Transaction[]> = {
      '2026-07': [tx('a', '2026-07-01'), tx('b', '2026-07-31')],
      '2026-08': [tx('c', '2026-08-01'), tx('d', '2026-08-15')],
    };
    const ids = payCycleTransactions(only, '2026-07', 1)
      .map((t) => t.id)
      .sort();
    expect(ids).toEqual(['a', 'b']);
  });
});

describe('payCycleLabelRange', () => {
  it('ends on the day before endExclusive (mid-year)', () => {
    expect(payCycleLabelRange('2026-07', 10)).toEqual({
      startDate: '2026-07-10',
      endDate: '2026-08-09',
    });
  });

  it('ends on the day before endExclusive across a year boundary', () => {
    expect(payCycleLabelRange('2026-12', 10)).toEqual({
      startDate: '2026-12-10',
      endDate: '2027-01-09',
    });
  });
});
