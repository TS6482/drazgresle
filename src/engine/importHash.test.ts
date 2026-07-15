import { describe, expect, it } from 'vitest';
import { importHash } from './importHash';

describe('importHash', () => {
  const base = {
    date: '2026-06-01',
    amountHalere: -12345,
    counterparty: 'Jan Novák',
    description: 'SHOP ACME Praha 1, 11000, CZE',
  };

  it('is stable for identical input', () => {
    expect(importHash(base)).toBe(importHash({ ...base }));
  });

  it('produces an 8-character lowercase hex string', () => {
    expect(importHash(base)).toMatch(/^[0-9a-f]{8}$/);
  });

  it('changes when any field changes', () => {
    const h = importHash(base);
    expect(importHash({ ...base, date: '2026-06-02' })).not.toBe(h);
    expect(importHash({ ...base, amountHalere: -12346 })).not.toBe(h);
    expect(importHash({ ...base, counterparty: 'Eva Malá' })).not.toBe(h);
    expect(importHash({ ...base, description: 'OTHER SHOP' })).not.toBe(h);
  });

  it('distinguishes accented from ASCII-folded text', () => {
    expect(importHash({ ...base, counterparty: 'Dvorak' })).not.toBe(
      importHash({ ...base, counterparty: 'Dvořák' }),
    );
  });

  it('does not blur field boundaries (sign/grouping cannot alias)', () => {
    // Moving a digit across the amount|counterparty boundary must differ.
    const a = importHash({ ...base, amountHalere: -1, counterparty: '2345' });
    const b = importHash({ ...base, amountHalere: -12, counterparty: '345' });
    expect(a).not.toBe(b);
  });
});
