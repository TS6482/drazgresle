// Air Bank statement PDF parser. Consumes the text items pdf.js extracts from a
// downloaded Air Bank current-account statement ("Výpis z běžného účtu") and
// reconstructs the header totals and the transaction table.
//
// Built against six real statements (Jan–Jun 2026); do not change the column
// geometry without re-running scripts/verify-samples.mjs against all of them.
//
// Layout facts (verified from the samples, coordinates in pdf.js user space,
// origin bottom-left so LARGER y = higher on the page):
//
//   Header block (page 1):
//     "Číslo účtu:"          → "1234567890 / 3030"
//     "Období výpisu:"       → "1. 6. 2026 - 30. 6. 2026"
//     "Počáteční zůstatek:"  "Připsáno na účet:"   (one line, two values)
//     "Konečný zůstatek:"    "Odepsáno z účtu:"    (one line, two values)
//
//   Transaction table (repeats its header on every page). Each transaction is
//   2–4 stacked text lines sharing left-aligned columns:
//     col DATE   (x≈60)  line1 = Zaúčtování (booking) date, line2 = Provedení date
//     col TYP    (x≈108) line1 = Typ (e.g. "Platba kartou"), line2 = Kód transakce
//     col NAME   (x≈186) line1 = Název (counterparty), line2 = account / card no.
//     col DETAIL (x≈325) 1–3 lines of Detaily (may include an FX "… EUR kurz: …")
//     col AMOUNT (x≈490) line1 only = Částka CZK (signed)
//     col FEE    (x≈545) line1 only = Poplatky (signed; folded into the amount)
//
// The anchor of a transaction is its line1: the only line carrying both a
// booking date (DATE column) and a money amount (AMOUNT column). Following lines
// with a date but no amount are the line2 (Provedení + code + account); lines
// with content only in the DETAIL column are extra Detaily. Everything else
// (repeated table headers, "Pokračování na straně …", page numbers, the bank
// address and deposit-insurance disclaimer) carries neither and is ignored.

/** One positioned text fragment from pdf.js. `y` grows upward (PDF user space). */
export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  page: number;
}

/** Header totals parsed from the statement's summary block. */
export interface StatementHeader {
  /** Account number as "number/bankCode", e.g. "1234567890/3030". */
  accountNumber: string;
  /** Statement period start, ISO `YYYY-MM-DD`. */
  periodStart: string;
  /** Statement period end, ISO `YYYY-MM-DD`. */
  periodEnd: string;
  /** Balance before the first transaction, signed halere. */
  startingBalanceHalere: number;
  /** Balance after the last transaction, signed halere. */
  endingBalanceHalere: number;
  /** Total credited over the period (positive halere). */
  creditedHalere: number;
  /** Total debited over the period (positive halere). */
  debitedHalere: number;
}

/** One reconstructed transaction row. */
export interface ParsedTransaction {
  /** Booking (Zaúčtování) date, ISO `YYYY-MM-DD`. */
  date: string;
  /** Částka + Poplatky, signed halere (fee folded in; negative = outflow). */
  amountHalere: number;
  /** Název line (may be empty, e.g. an outgoing transfer with no name). */
  counterparty: string;
  /** Counterparty account "number/bankCode" when present; card numbers excluded. */
  counterpartyAccount?: string;
  /** Detaily lines joined with a single space. */
  description: string;
  /** The Typ string, e.g. "Platba kartou". */
  type: string;
}

/** Full parse result: header totals plus the transaction list. */
export interface AirbankStatement {
  statement: StatementHeader;
  transactions: ParsedTransaction[];
}

/**
 * Thrown when the PDF is readable but is not a recognizable Air Bank statement,
 * carrying a plain-language message safe to show the user.
 */
export class AirbankParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AirbankParseError';
  }
}

// --- column geometry (pdf.js x, in points) -----------------------------------
const COL_TYP_MIN = 100;
const COL_NAME_MIN = 184;
const COL_DETAIL_MIN = 320;
const COL_AMOUNT_MIN = 455;
const COL_FEE_MIN = 530;

/** Two items belong to the same visual row when their y are within this many pt. */
const LINE_TOLERANCE = 2.5;

type Column = 'date' | 'typ' | 'name' | 'detail' | 'amount' | 'fee';

function columnOf(x: number): Column {
  if (x < COL_TYP_MIN) return 'date';
  if (x < COL_NAME_MIN) return 'typ';
  if (x < COL_DETAIL_MIN) return 'name';
  if (x < COL_AMOUNT_MIN) return 'detail';
  if (x < COL_FEE_MIN) return 'amount';
  return 'fee';
}

/** A visual row: its items grouped by column (text joined left-to-right). */
interface Row {
  page: number;
  y: number;
  cols: Record<Column, string>;
}

const DATE_RE = /^(\d{2})\.(\d{2})\.(\d{4})$/;
// A Czech money amount: optional minus, digit groups (space/NBSP separated),
// comma, exactly two decimals. Anchored so account/card numbers never match.
const MONEY_RE = /^-?\d{1,3}(?:[\s]\d{3})*,\d{2}$/;
// A real counterparty account "1234567890 / 0800", anchored for the tx-line2
// column where the whole cell is the account (card numbers contain '*').
const ACCOUNT_RE = /^(\d{1,16})\s*\/\s*(\d{4})$/;
// The same shape, unanchored, to pluck the account out of a longer header line
// ("1234567890 / 3030  Název účtu: …").
const ACCOUNT_SEARCH_RE = /(\d{1,16})\s*\/\s*(\d{4})/;

/**
 * Parse a Czech-formatted money string into signed integer halere.
 * "1 234,56" → 123456, "-99,00" → -9900. Returns null if not a money token.
 */
export function parseCzechAmount(raw: string): number | null {
  const s = raw.trim();
  if (!MONEY_RE.test(s)) {
    return null;
  }
  const negative = s.startsWith('-');
  const digits = s.replace(/[\s-]/g, '');
  const [whole, frac] = digits.split(',');
  const halere = Number(whole) * 100 + Number(frac);
  return negative ? -halere : halere;
}

/** "01.06.2026" → "2026-06-01". Returns null if not a DD.MM.YYYY date. */
function parseDate(raw: string): string | null {
  const m = DATE_RE.exec(raw.trim());
  if (!m) {
    return null;
  }
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** "1. 6. 2026" → "2026-06-01" (single-digit day/month, spaces after dots). */
function parseHeaderDate(d: string, mo: string, y: string): string {
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/** Cluster positioned items into visual rows, top-of-page first. */
function buildRows(items: PdfTextItem[]): Row[] {
  const meaningful = items.filter((it) => it.str.trim() !== '');
  // page ascending, then y descending (top of page first), then x ascending.
  const sorted = [...meaningful].sort(
    (a, b) => a.page - b.page || b.y - a.y || a.x - b.x,
  );

  const rows: Row[] = [];
  let current: Row | null = null;
  for (const it of sorted) {
    if (
      current === null ||
      it.page !== current.page ||
      Math.abs(it.y - current.y) > LINE_TOLERANCE
    ) {
      current = {
        page: it.page,
        y: it.y,
        cols: { date: '', typ: '', name: '', detail: '', amount: '', fee: '' },
      };
      rows.push(current);
    }
    const col = columnOf(it.x);
    current.cols[col] = current.cols[col] === '' ? it.str.trim() : `${current.cols[col]} ${it.str.trim()}`;
  }
  return rows;
}

// --- header parsing ----------------------------------------------------------

/** Join every item on `label`'s row that sits to its right, left-to-right. */
function textRightOfLabel(items: PdfTextItem[], labelPrefix: string): string | null {
  const label = items.find((it) => it.str.trim().startsWith(labelPrefix));
  if (!label) {
    return null;
  }
  return items
    .filter((it) => it.page === label.page && Math.abs(it.y - label.y) <= LINE_TOLERANCE && it.x > label.x)
    .sort((a, b) => a.x - b.x)
    .map((it) => it.str.trim())
    .filter((s) => s !== '')
    .join(' ');
}

/** First money token in the text right of a balance label, as signed halere. */
function balanceAfter(items: PdfTextItem[], labelPrefix: string): number | null {
  const text = textRightOfLabel(items, labelPrefix);
  if (text === null) {
    return null;
  }
  const m = /-?\d[\d\s]*,\d{2}/.exec(text);
  if (!m) {
    return null;
  }
  return parseCzechAmount(m[0]);
}

function parseHeader(items: PdfTextItem[]): StatementHeader {
  const accountText = textRightOfLabel(items, 'Číslo účtu:');
  const periodText = textRightOfLabel(items, 'Období výpisu:');
  const starting = balanceAfter(items, 'Počáteční zůstatek');
  const ending = balanceAfter(items, 'Konečný zůstatek');
  const credited = balanceAfter(items, 'Připsáno na účet');
  const debited = balanceAfter(items, 'Odepsáno z účtu');

  if (
    accountText === null ||
    periodText === null ||
    starting === null ||
    ending === null ||
    credited === null ||
    debited === null
  ) {
    throw new AirbankParseError(
      "This does not look like an Air Bank statement. Please choose an Air Bank current-account statement PDF (“Výpis z běžného účtu”).",
    );
  }

  const accM = ACCOUNT_SEARCH_RE.exec(accountText);
  if (!accM) {
    throw new AirbankParseError('Could not read the account number from this PDF.');
  }
  const accountNumber = `${accM[1]}/${accM[2]}`;

  const perM =
    /(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\s*-\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/.exec(periodText);
  if (!perM) {
    throw new AirbankParseError('Could not read the statement period from this PDF.');
  }

  return {
    accountNumber,
    periodStart: parseHeaderDate(perM[1], perM[2], perM[3]),
    periodEnd: parseHeaderDate(perM[4], perM[5], perM[6]),
    startingBalanceHalere: starting,
    endingBalanceHalere: ending,
    creditedHalere: credited,
    debitedHalere: debited,
  };
}

// --- transaction parsing -----------------------------------------------------

/** True when a row is a transaction's anchor line (booking date + amount). */
function isAnchor(row: Row): boolean {
  return DATE_RE.test(row.cols.date) && MONEY_RE.test(row.cols.amount);
}

/** True when a row is a transaction's line2 (a date but no amount). */
function isSecondLine(row: Row): boolean {
  return DATE_RE.test(row.cols.date) && row.cols.amount === '';
}

/** True when a row carries content only in the Detaily column. */
function isDetailOnly(row: Row): boolean {
  return (
    row.cols.detail !== '' &&
    row.cols.date === '' &&
    row.cols.typ === '' &&
    row.cols.name === '' &&
    row.cols.amount === ''
  );
}

interface Draft {
  date: string;
  type: string;
  counterparty: string;
  counterpartyAccount?: string;
  details: string[];
  amountHalere: number;
}

function finalize(draft: Draft): ParsedTransaction {
  const tx: ParsedTransaction = {
    date: draft.date,
    amountHalere: draft.amountHalere,
    counterparty: draft.counterparty,
    description: draft.details.filter((d) => d !== '').join(' '),
    type: draft.type,
  };
  if (draft.counterpartyAccount !== undefined) {
    tx.counterpartyAccount = draft.counterpartyAccount;
  }
  return tx;
}

function parseTransactions(rows: Row[]): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];
  let draft: Draft | null = null;

  const flush = () => {
    if (draft) {
      transactions.push(finalize(draft));
      draft = null;
    }
  };

  for (const row of rows) {
    if (isAnchor(row)) {
      flush();
      const date = parseDate(row.cols.date);
      const amount = parseCzechAmount(row.cols.amount);
      if (date === null || amount === null) {
        continue;
      }
      const fee = row.cols.fee === '' ? 0 : (parseCzechAmount(row.cols.fee) ?? 0);
      draft = {
        date,
        type: row.cols.typ,
        counterparty: row.cols.name,
        details: [row.cols.detail],
        amountHalere: amount + fee,
      };
      continue;
    }
    if (draft === null) {
      continue;
    }
    if (isSecondLine(row)) {
      // Line2 carries the counterparty account (or a card number) and more detail.
      const accM = ACCOUNT_RE.exec(row.cols.name);
      if (accM) {
        draft.counterpartyAccount = `${accM[1]}/${accM[2]}`;
      }
      if (row.cols.detail !== '') {
        draft.details.push(row.cols.detail);
      }
      continue;
    }
    if (isDetailOnly(row)) {
      draft.details.push(row.cols.detail);
      continue;
    }
    // Any other row (repeated header, footer, disclaimer) ends the current tx's
    // continuation but does not itself start one.
  }
  flush();
  return transactions;
}

/**
 * Parse the pdf.js text items of an Air Bank statement into its header totals
 * and transaction list. Throws {@link AirbankParseError} (with a user-facing
 * message) when the PDF is not a recognizable Air Bank statement.
 */
export function parseAirbank(items: PdfTextItem[]): AirbankStatement {
  if (items.length === 0) {
    throw new AirbankParseError(
      'This PDF has no readable text. It may be a scanned image rather than a bank statement.',
    );
  }
  const statement = parseHeader(items);
  const rows = buildRows(items);
  const transactions = parseTransactions(rows);
  return { statement, transactions };
}
