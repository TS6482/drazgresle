import { describe, expect, it } from 'vitest';
import { parsePercentInput } from './percent';

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
