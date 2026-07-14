import { describe, expect, it } from 'vitest';
import { formatKc, parseKcInput } from './money';

// The formatter uses a non-breaking space (U+00A0) for grouping and before "Kč".
// Build expectations with the same character so the intent is explicit.
const NBSP = ' ';
const kc = (body: string) => `${body}${NBSP}Kč`;

describe('formatKc', () => {
  it('formats whole crowns with NBSP thousands separators', () => {
    // 123 456 700 halere = 1 234 567 crowns
    expect(formatKc(123456700)).toBe(kc(`1${NBSP}234${NBSP}567`));
  });

  it('groups exactly at the thousands boundary', () => {
    expect(formatKc(100000)).toBe(kc(`1${NBSP}000`)); // 1 000 crowns
    expect(formatKc(99900)).toBe(kc('999')); // 999 crowns, no separator
  });

  it('formats zero', () => {
    expect(formatKc(0)).toBe(kc('0'));
  });

  it('prefixes negatives with a minus sign', () => {
    expect(formatKc(-500000)).toBe(kc('-5' + NBSP + '000')); // -5 000 crowns
  });

  it('rounds halere to whole crowns by default (round half up)', () => {
    expect(formatKc(150)).toBe(kc('2')); // 1.50 crown -> 2
    expect(formatKc(149)).toBe(kc('1')); // 1.49 crown -> 1
    expect(formatKc(50)).toBe(kc('1')); // 0.50 crown -> 1
  });

  it('does not show a minus when a small negative rounds to zero', () => {
    expect(formatKc(-40)).toBe(kc('0')); // -0.40 crown rounds to 0, no sign
  });

  it('shows halere when decimals are requested (comma separator)', () => {
    expect(formatKc(123450, { decimals: 2 })).toBe(kc(`1${NBSP}234,50`)); // 1 234,50
    expect(formatKc(123456, { decimals: 2 })).toBe(kc(`1${NBSP}234,56`));
    expect(formatKc(5, { decimals: 2 })).toBe(kc('0,05')); // 0.05 crown
    expect(formatKc(-12345, { decimals: 2 })).toBe(kc('-123,45'));
  });

  it('omits the currency suffix when suffix: false (for form inputs)', () => {
    expect(formatKc(123456700, { suffix: false })).toBe(`1${NBSP}234${NBSP}567`);
    expect(formatKc(0, { suffix: false })).toBe('0');
    expect(formatKc(123450, { decimals: 2, suffix: false })).toBe(`1${NBSP}234,50`);
  });
});

describe('parseKcInput', () => {
  it('accepts space-grouped thousands', () => {
    expect(parseKcInput('1 234 567')).toBe(123456700);
  });

  it('accepts NBSP-grouped thousands', () => {
    expect(parseKcInput(`1${NBSP}234${NBSP}567`)).toBe(123456700);
  });

  it('accepts plain digits', () => {
    expect(parseKcInput('1234567')).toBe(123456700);
  });

  it('accepts a comma decimal', () => {
    expect(parseKcInput('1 234,50')).toBe(123450);
  });

  it('accepts a dot decimal', () => {
    expect(parseKcInput('1234.50')).toBe(123450);
  });

  it('accepts a single decimal digit', () => {
    expect(parseKcInput('1 234,5')).toBe(123450); // ,5 -> 50 halere
  });

  it('parses zero and negatives', () => {
    expect(parseKcInput('0')).toBe(0);
    expect(parseKcInput('-5 000')).toBe(-500000);
  });

  it('rounds excess decimal digits to halere', () => {
    expect(parseKcInput('1234,999')).toBe(123500); // 1234.999 -> 1235.00
    expect(parseKcInput('10,005')).toBe(1001); // -> 10.01
    expect(parseKcInput('10,004')).toBe(1000); // -> 10.00
  });

  it('tolerates a trailing "Kč" suffix', () => {
    expect(parseKcInput(`1 234 567${NBSP}Kč`)).toBe(123456700);
    expect(parseKcInput('50 Kč')).toBe(5000);
  });

  it('rejects garbage', () => {
    expect(parseKcInput('')).toBeNull();
    expect(parseKcInput('   ')).toBeNull();
    expect(parseKcInput('abc')).toBeNull();
    expect(parseKcInput('12x3')).toBeNull();
    expect(parseKcInput('1,2,3')).toBeNull(); // multiple separators
    expect(parseKcInput('1.2.3')).toBeNull();
    expect(parseKcInput('-')).toBeNull();
  });
});
