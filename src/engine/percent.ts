// Percentage-input parsing, same philosophy as parseKcInput: Czech phone
// keyboards produce a decimal COMMA, so both "," and "." are accepted as the
// separator. Rates are plain numbers (not money), so returning a float is fine.

/**
 * Parse a user-entered percentage into a number, or `null` if the input is not
 * a valid non-negative rate. Accepts "5", "5.29", "5,29", surrounding
 * whitespace, and an optional trailing "%". Rejects negatives, signs, and
 * garbage (letters, multiple separators, exponents).
 */
export function parsePercentInput(raw: string): number | null {
  if (typeof raw !== 'string') {
    return null;
  }

  const s = raw.replace(/%/g, '').trim();
  if (s === '') {
    return null;
  }

  // Digits, then at most one decimal separator followed by more digits.
  // No sign allowed — a negative interest/growth rate is rejected here.
  const match = /^(\d+)(?:[.,](\d+))?$/.exec(s);
  if (!match) {
    return null;
  }

  return Number(match[2] !== undefined ? `${match[1]}.${match[2]}` : match[1]);
}

/** Non-breaking space (U+00A0) — the gap before the "%" suffix, matching the
 *  Czech spacing money.ts uses before "Kč". Written as an escape so it stays
 *  visible and lint-clean. */
const NBSP = '\u00a0';

export interface FormatPercentOptions {
  /** Decimal places to show. Default 1. */
  decimals?: number;
  /** Prefix non-negative values with "+" (for signed gain/loss). Default false. */
  signed?: boolean;
}

/**
 * Format a number as a Czech-style percentage: a comma decimal separator and a
 * non-breaking space before "%", e.g. `formatPercent(-34.28)` → `"-34,3 %"`.
 * Rounds to `decimals` places (default 1). With `{ signed: true }` a positive
 * value gets a leading "+"; an exact zero never shows a sign. Negatives always
 * carry a leading "-" (ASCII, matching formatKc).
 */
export function formatPercent(value: number, options: FormatPercentOptions = {}): string {
  const decimals = options.decimals ?? 1;
  const negative = value < 0;

  // Work in scaled integers so rounding is exact and symmetric about zero.
  const factor = 10 ** decimals;
  const scaled = Math.round(Math.abs(value) * factor);
  const intPart = Math.floor(scaled / factor);
  const fracPart = scaled - intPart * factor;

  let numberStr = String(intPart);
  if (decimals > 0) {
    numberStr += `,${String(fracPart).padStart(decimals, '0')}`;
  }

  const sign =
    scaled === 0 ? '' : negative ? '-' : options.signed ? '+' : '';
  return `${sign}${numberStr}${NBSP}%`;
}
