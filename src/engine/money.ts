// Money formatting and parsing for CZK. All amounts are integer halere (CZK × 100)
// throughout the app — we never carry currency in floats. Display follows Czech
// convention: a non-breaking space (U+00A0) groups thousands and a comma is the
// decimal separator, e.g. "1 234 567 Kč". The formatter is hand-rolled (no
// Intl.NumberFormat) so tests are deterministic across environments.

/** Non-breaking space (U+00A0) — the thousands group separator and the gap
 *  before the "Kč" suffix. Written as an escape (not a literal character) so
 *  it stays visible to readers and lint-clean (no-irregular-whitespace). */
const NBSP = '\u00a0';

const CURRENCY_SUFFIX = `${NBSP}Kč`;

export interface FormatKcOptions {
  /** Decimal places to show. Default 0 (whole crowns, halere rounded). */
  decimals?: number;
  /** Append the " Kč" suffix. Default true; set false for form inputs. */
  suffix?: boolean;
}

/** Group a non-negative integer's digits into threes with NBSP separators. */
function groupThousands(digits: string): string {
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) {
      out += NBSP;
    }
    out += digits[i];
  }
  return out;
}

/**
 * Format an integer halere amount as Czech koruna, e.g. `formatKc(123456700)` →
 * `"1 234 567 Kč"`. Negatives get a leading minus. With `{ decimals: 2 }` the
 * halere are shown after a comma (`"1 234,56 Kč"`); the default rounds to whole
 * crowns.
 */
export function formatKc(halere: number, options: FormatKcOptions = {}): string {
  const decimals = options.decimals ?? 0;
  const negative = halere < 0;
  const absHalere = Math.abs(halere);

  // Scale to an integer with `decimals` fractional digits, rounding halere as
  // needed. Working in scaled integers keeps everything exact.
  const factor = 10 ** decimals;
  const scaled = Math.round((absHalere * factor) / 100);
  const intPart = Math.floor(scaled / factor);
  const fracPart = scaled - intPart * factor;

  let numberStr = groupThousands(String(intPart));
  if (decimals > 0) {
    numberStr += `,${String(fracPart).padStart(decimals, '0')}`;
  }

  // Suppress a spurious minus when the value rounds to exactly zero.
  const sign = negative && scaled !== 0 ? '-' : '';
  const suffix = options.suffix === false ? '' : CURRENCY_SUFFIX;
  return `${sign}${numberStr}${suffix}`;
}

/**
 * Parse a user-entered crown amount into integer halere, or `null` if the input
 * is not a valid number. Accepts optional thousands spacing (regular or NBSP),
 * either `,` or `.` as the decimal separator, an optional leading sign, and an
 * optional trailing "Kč". Extra decimal digits are rounded to halere. Anything
 * else — letters, multiple separators, empty input — returns `null`.
 */
export function parseKcInput(raw: string): number | null {
  if (typeof raw !== 'string') {
    return null;
  }

  let s = raw.replace(/kč/gi, '').trim();
  if (s === '') {
    return null;
  }

  let sign = 1;
  if (s.startsWith('-')) {
    sign = -1;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }

  // Drop all spacing used to group thousands (regular spaces and NBSP;
  // the \u00a0 escape keeps the character visible and lint-clean).
  s = s.replace(/[\s\u00a0]/g, '');
  if (s === '') {
    return null;
  }

  // Digits, then at most one decimal separator followed by more digits.
  const match = /^(\d+)(?:[.,](\d+))?$/.exec(s);
  if (!match) {
    return null;
  }

  const crowns = Number(match[1]);
  const fracRaw = match[2] ?? '';

  let halereFrac = 0;
  if (fracRaw !== '') {
    // Keep two halere digits plus one guard digit for rounding.
    const padded = (fracRaw + '000').slice(0, 3);
    halereFrac = Number(padded.slice(0, 2));
    if (Number(padded[2]) >= 5) {
      halereFrac += 1;
    }
  }

  return sign * (crowns * 100 + halereFrac);
}
