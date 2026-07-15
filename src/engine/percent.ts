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
