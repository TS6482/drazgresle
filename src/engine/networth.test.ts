import { describe, expect, it } from 'vitest';
import { classify, computeNetWorth, computeSeries } from './networth';
import type { Account, Snapshot } from '../types/data';

function account(id: string, type: Account['type']): Account {
  return { id, name: id, type, owner: 'joint', active: true };
}

const accounts: Account[] = [
  account('chk', 'checking'),
  account('sav', 'savings'),
  account('inv', 'investment'),
  account('pen', 'pension'),
  account('house', 'property'),
  account('art', 'other-asset'),
  account('mort', 'mortgage'),
  account('fam', 'family-loan'),
  account('cc', 'other-liability'),
];

describe('classify', () => {
  it('maps each account type to its bucket', () => {
    expect(classify(account('a', 'checking'))).toBe('bank');
    expect(classify(account('a', 'savings'))).toBe('bank');
    expect(classify(account('a', 'investment'))).toBe('investments');
    expect(classify(account('a', 'pension'))).toBe('pensions');
    expect(classify(account('a', 'property'))).toBe('property');
    expect(classify(account('a', 'other-asset'))).toBe('otherAssets');
    expect(classify(account('a', 'mortgage'))).toBe('liabilities');
    expect(classify(account('a', 'family-loan'))).toBe('liabilities');
    expect(classify(account('a', 'other-liability'))).toBe('liabilities');
  });
});

describe('computeNetWorth', () => {
  it('sums buckets and subtracts liabilities (stored positive = owed)', () => {
    const snapshot: Snapshot = {
      date: '2026-03-31',
      balances: {
        chk: 50_000,
        sav: 100_000,
        inv: 200_000,
        pen: 300_000,
        house: 5_000_000,
        art: 25_000,
        mort: 3_000_000, // owed
        fam: 150_000, // owed
        cc: 10_000, // owed
      },
    };

    const result = computeNetWorth(accounts, snapshot);

    expect(result.byClass.bank).toBe(150_000); // 50 000 + 100 000
    expect(result.byClass.investments).toBe(200_000);
    expect(result.byClass.pensions).toBe(300_000);
    expect(result.byClass.property).toBe(5_000_000);
    expect(result.byClass.otherAssets).toBe(25_000);
    expect(result.byClass.liabilities).toBe(3_160_000); // 3 000 000 + 150 000 + 10 000

    expect(result.assetsTotal).toBe(5_675_000);
    expect(result.liabilitiesTotal).toBe(3_160_000);
    expect(result.netHalere).toBe(2_515_000); // 5 675 000 − 3 160 000
  });

  it('treats missing balances as zero', () => {
    const snapshot: Snapshot = { date: '2026-03-31', balances: { chk: 42_000 } };
    const result = computeNetWorth(accounts, snapshot);
    expect(result.byClass.bank).toBe(42_000);
    expect(result.assetsTotal).toBe(42_000);
    expect(result.liabilitiesTotal).toBe(0);
    expect(result.netHalere).toBe(42_000);
  });

  it('can go negative when liabilities exceed assets', () => {
    const snapshot: Snapshot = {
      date: '2026-03-31',
      balances: { chk: 10_000, mort: 500_000 },
    };
    expect(computeNetWorth(accounts, snapshot).netHalere).toBe(-490_000);
  });
});

describe('computeSeries', () => {
  it('returns one row per snapshot, sorted chronologically', () => {
    const snapshots: Snapshot[] = [
      { date: '2026-06-30', balances: { chk: 200_000, mort: 100_000 } },
      { date: '2026-03-31', balances: { chk: 100_000, mort: 150_000 } },
    ];

    const series = computeSeries(accounts, snapshots);

    expect(series.map((r) => r.date)).toEqual(['2026-03-31', '2026-06-30']);
    expect(series[0]).toMatchObject({ bank: 100_000, liabilities: 150_000, net: -50_000 });
    expect(series[1]).toMatchObject({ bank: 200_000, liabilities: 100_000, net: 100_000 });
  });
});
