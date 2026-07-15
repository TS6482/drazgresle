import { describe, expect, it } from 'vitest';
import { formatPercent, parsePercentInput } from './percent';

const NBSP = '\u00a0';

describe('parsePercentInput', () => {
  it('parses a plain integer', () => {
    expect(parsePercentInput('5')).toBe(5);
    expect(parsePercentInput('0')).toBe(0);
  });

  it('parses a dot decimal', () => {
    expect(parsePercentInput('5.29')).toBe(5.29);
  });

  it('parses a comma decimal (Czech keyboard)', () => {
    expect(parsePercentInput('5,29')).toBe(5.29);
    expect(parsePercentInput('4,9')).toBe(4.9);
  });

  it('trims surrounding whitespace', () => {
    expect(parsePercentInput('  4,9  ')).toBe(4.9);
  });

  it('tolerates a trailing % sign', () => {
    expect(parsePercentInput('5,29 %')).toBe(5.29);
    expect(parsePercentInput('5%')).toBe(5);
  });

  it('rejects empty and whitespace-only input', () => {
    expect(parsePercentInput('')).toBeNull();
    expect(parsePercentInput('   ')).toBeNull();
  });

  it('rejects negatives and signs', () => {
    expect(parsePercentInput('-5')).toBeNull();
    expect(parsePercentInput('+5')).toBeNull();
  });

  it('rejects garbage', () => {
    expect(parsePercentInput('abc')).toBeNull();
    expect(parsePercentInput('5x')).toBeNull();
    expect(parsePercentInput('5..2')).toBeNull();
    expect(parsePercentInput('5,2,3')).toBeNull();
    expect(parsePercentInput('1e3')).toBeNull();
    expect(parsePercentInput(',5')).toBeNull();
    expect(parsePercentInput('5,')).toBeNull();
  });
});

describe('formatPercent', () => {
  it('formats with one decimal and a comma separator by default', () => {
    expect(formatPercent(5)).toBe(`5,0${NBSP}%`);
    expect(formatPercent(12.5)).toBe(`12,5${NBSP}%`);
  });

  it('rounds to the requested decimals (half up, symmetric about zero)', () => {
    expect(formatPercent(34.28)).toBe(`34,3${NBSP}%`);
    expect(formatPercent(34.25)).toBe(`34,3${NBSP}%`);
    expect(formatPercent(-34.28)).toBe(`-34,3${NBSP}%`);
    expect(formatPercent(34.6, { decimals: 0 })).toBe(`35${NBSP}%`);
  });

  it('carries a leading minus on negatives', () => {
    expect(formatPercent(-12.5)).toBe(`-12,5${NBSP}%`);
  });

  it('adds a leading + for non-negative values when signed', () => {
    expect(formatPercent(12.5, { signed: true })).toBe(`+12,5${NBSP}%`);
    expect(formatPercent(-34.28, { signed: true })).toBe(`-34,3${NBSP}%`);
  });

  it('never signs an exact zero', () => {
    expect(formatPercent(0)).toBe(`0,0${NBSP}%`);
    expect(formatPercent(0, { signed: true })).toBe(`0,0${NBSP}%`);
    expect(formatPercent(-0.01)).toBe(`0,0${NBSP}%`);
  });
});
