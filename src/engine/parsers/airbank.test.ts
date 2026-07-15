import { describe, expect, it } from 'vitest';
import {
  AirbankParseError,
  parseAirbank,
  parseCzechAmount,
  type PdfTextItem,
} from './airbank';

// IMPORTANT: every fixture below is SYNTHETIC — invented names, amounts and
// account numbers that merely mimic the real Air Bank layout geometry. No real
// statement content is reproduced here (real samples live outside the repo).

// Column x-coordinates matching the real statement geometry (see airbank.ts).
const X = { date: 60, typ: 108, name: 186, detail: 325, amount: 490, fee: 545 } as const;
const NBSP = ' ';

function item(str: string, x: number, y: number, page = 1): PdfTextItem {
  return { str, x, y, page };
}

/** Build the header block items (page 1) with the given balances/period. */
function header(opts: {
  account?: string;
  period?: string;
  start: string;
  end: string;
  credited: string;
  debited: string;
}): PdfTextItem[] {
  const account = opts.account ?? '9998887770 / 3030';
  const period = opts.period ?? '1. 6. 2026 - 30. 6. 2026';
  return [
    item('Číslo účtu:', X.date, 537),
    item(account, 110, 537),
    item('Název účtu:', 258, 537),
    item('Testovací účet', 313, 537),
    item('Období výpisu:', X.date, 519),
    item(period, 129, 519),
    item('Počáteční zůstatek:', X.date, 449),
    item(opts.start, 182, 449),
    item('Připsáno na účet:', 258, 449),
    item(opts.credited, 347, 449),
    item('Konečný zůstatek:', X.date, 431),
    item(opts.end, 182, 431),
    item('Odepsáno z účtu:', 258, 431),
    item(opts.debited, 347, 431),
  ];
}

/** A repeated on-page table header (appears at the top of every page). */
function tableHeader(y: number, page: number): PdfTextItem[] {
  return [
    item('Zaúčtování', X.date, y, page),
    item('Typ', X.typ, y, page),
    item('Název', X.name, y, page),
    item('Detaily', X.detail, y, page),
    item('Částka CZK', X.amount, y, page),
    item('Poplatky', X.fee, y, page),
    item('Provedení', X.date, y - 10, page),
    item('Kód transakce', X.typ, y - 10, page),
    item('Číslo účtu / debetní karty', X.name, y - 10, page),
  ];
}

describe('parseCzechAmount', () => {
  it('parses plain amounts to halere', () => {
    expect(parseCzechAmount('99,00')).toBe(9900);
    expect(parseCzechAmount('0,00')).toBe(0);
    expect(parseCzechAmount('54,90')).toBe(5490);
  });

  it('parses negatives', () => {
    expect(parseCzechAmount('-99,00')).toBe(-9900);
    expect(parseCzechAmount('-1 668,62')).toBe(-166862);
  });

  it('parses thousands groups with a normal space or an NBSP', () => {
    expect(parseCzechAmount('1 234,56')).toBe(123456);
    expect(parseCzechAmount(`1${NBSP}234,56`)).toBe(123456);
    expect(parseCzechAmount('65 272,00')).toBe(6527200);
    expect(parseCzechAmount(`1${NBSP}234${NBSP}567,89`)).toBe(123456789);
  });

  it('rejects non-money strings', () => {
    expect(parseCzechAmount('555544******7808')).toBeNull();
    expect(parseCzechAmount('1112223334 / 0800')).toBeNull();
    expect(parseCzechAmount('abc')).toBeNull();
    expect(parseCzechAmount('12')).toBeNull();
  });
});

describe('parseAirbank — header', () => {
  it('reads account, period and balances', () => {
    const { statement } = parseAirbank(
      header({ start: '15 838,29', end: '28 813,13', credited: '173 495,00', debited: '160 520,16' }),
    );
    expect(statement.accountNumber).toBe('9998887770/3030');
    expect(statement.periodStart).toBe('2026-06-01');
    expect(statement.periodEnd).toBe('2026-06-30');
    expect(statement.startingBalanceHalere).toBe(1583829);
    expect(statement.endingBalanceHalere).toBe(2881313);
    expect(statement.creditedHalere).toBe(17349500);
    expect(statement.debitedHalere).toBe(16052016);
  });

  it('throws a friendly error when the PDF is not an Air Bank statement', () => {
    const notAirbank = [item('Some other bank', 60, 500), item('Hello', 60, 480)];
    expect(() => parseAirbank(notAirbank)).toThrow(AirbankParseError);
  });

  it('throws on an empty (image-only) PDF', () => {
    expect(() => parseAirbank([])).toThrow(AirbankParseError);
  });
});

describe('parseAirbank — transactions', () => {
  const hdr = header({ start: '0,00', end: '0,00', credited: '0,00', debited: '0,00' });

  it('parses a simple card payment (merchant in detail, cardholder as counterparty)', () => {
    const rows = [
      item('01.06.2026', X.date, 700),
      item('Platba kartou', X.typ, 700),
      item('Jan Novák', X.name, 700),
      item('SHOP ACME Praha 1,', X.detail, 700),
      item('-123,45', X.amount, 700),
      item('0,00', X.fee, 700),
      item('30.05.2026', X.date, 688),
      item('160000000001', X.typ, 688),
      item('555544******1234', X.name, 688),
      item('11000, CZE', X.detail, 688),
    ];
    const { transactions } = parseAirbank([...hdr, ...rows]);
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toEqual({
      date: '2026-06-01',
      amountHalere: -12345,
      counterparty: 'Jan Novák',
      description: 'SHOP ACME Praha 1, 11000, CZE',
      type: 'Platba kartou',
    });
    // A card number is never treated as a counterparty account.
    expect(transactions[0].counterpartyAccount).toBeUndefined();
  });

  it('folds a three-line detail block including the FX line into the description', () => {
    const rows = [
      item('02.06.2026', X.date, 700),
      item('Platba kartou', X.typ, 700),
      item('Jan Novák', X.name, 700),
      item('FAKE MERCHANT LONG NAME', X.detail, 700),
      item('-250,86', X.amount, 700),
      item('0,00', X.fee, 700),
      item('31.05.2026', X.date, 688),
      item('160000000002', X.typ, 688),
      item('555544******1234', X.name, 688),
      item('SOME CITY, 03195, ESP', X.detail, 688),
      item('10,00 EUR kurz: 25,086 CZK/EUR', X.detail, 676),
    ];
    const { transactions } = parseAirbank([...hdr, ...rows]);
    expect(transactions[0].description).toBe(
      'FAKE MERCHANT LONG NAME SOME CITY, 03195, ESP 10,00 EUR kurz: 25,086 CZK/EUR',
    );
  });

  it('parses an incoming payment carrying a counterparty account', () => {
    const rows = [
      item('02.06.2026', X.date, 700),
      item('Příchozí úhrada', X.typ, 700),
      item('ACME CORP', X.name, 700),
      item('VS9 / KS138', X.detail, 700),
      item('65 272,00', X.amount, 700),
      item('0,00', X.fee, 700),
      item('02.06.2026', X.date, 688),
      item('160000000003', X.typ, 688),
      item('9876543210 / 0300', X.name, 688),
      item('SALARY 2026/05', X.detail, 688),
    ];
    const { transactions } = parseAirbank([...hdr, ...rows]);
    expect(transactions[0].amountHalere).toBe(6527200);
    expect(transactions[0].counterpartyAccount).toBe('9876543210/0300');
    expect(transactions[0].description).toBe('VS9 / KS138 SALARY 2026/05');
  });

  it('folds an ATM withdrawal fee into the amount', () => {
    const rows = [
      item('02.06.2026', X.date, 700),
      item('Výběr hotovosti', X.typ, 700),
      item('Jan Novák', X.name, 700),
      item('Bankomat: FAKE ATM ABROAD', X.detail, 700),
      item('-6 497,86', X.amount, 700),
      item('-35,00', X.fee, 700),
      item('31.05.2026', X.date, 688),
      item('160000000004', X.typ, 688),
      item('555544******1234', X.name, 688),
    ];
    const { transactions } = parseAirbank([...hdr, ...rows]);
    // -6497,86 + -35,00 = -6532,86
    expect(transactions[0].amountHalere).toBe(-653286);
    expect(transactions[0].type).toBe('Výběr hotovosti');
  });

  it('handles an outgoing transfer with no counterparty name', () => {
    const rows = [
      item('02.06.2026', X.date, 700),
      item('Odchozí úhrada', X.typ, 700),
      // no Název item on line 1
      item('Note to payee', X.detail, 700),
      item('-2 500,00', X.amount, 700),
      item('0,00', X.fee, 700),
      item('02.06.2026', X.date, 688),
      item('160000000005', X.typ, 688),
      item('1029384756 / 2010', X.name, 688),
    ];
    const { transactions } = parseAirbank([...hdr, ...rows]);
    expect(transactions[0].counterparty).toBe('');
    expect(transactions[0].counterpartyAccount).toBe('1029384756/2010');
    expect(transactions[0].amountHalere).toBe(-250000);
  });

  it('keeps transactions separate across a page break with a repeated header', () => {
    const page1Tx = [
      item('29.06.2026', X.date, 200, 1),
      item('Platba kartou', X.typ, 200, 1),
      item('Jan Novák', X.name, 200, 1),
      item('LAST ON PAGE ONE', X.detail, 200, 1),
      item('-10,00', X.amount, 200, 1),
      item('0,00', X.fee, 200, 1),
      item('28.06.2026', X.date, 188, 1),
      item('160000000006', X.typ, 188, 1),
      item('555544******1234', X.name, 188, 1),
      // page-1 footer noise the parser must ignore
      item('Pokračování na straně 2', X.date, 82, 1),
      item('1/2', 552, 39, 1),
      item('Air Bank a.s. / Evropská 2690/17', 255, 24, 1),
    ];
    const page2 = [
      ...tableHeader(806, 2),
      item('30.06.2026', X.date, 780, 2),
      item('Platba kartou', X.typ, 780, 2),
      item('Eva Malá', X.name, 780, 2),
      item('FIRST ON PAGE TWO', X.detail, 780, 2),
      item('-20,00', X.amount, 780, 2),
      item('0,00', X.fee, 780, 2),
      item('29.06.2026', X.date, 768, 2),
      item('160000000007', X.typ, 768, 2),
      item('555544******9999', X.name, 768, 2),
    ];
    const { transactions } = parseAirbank([...hdr, ...page1Tx, ...page2]);
    expect(transactions).toHaveLength(2);
    expect(transactions[0].description).toBe('LAST ON PAGE ONE');
    expect(transactions[0].counterparty).toBe('Jan Novák');
    expect(transactions[1].description).toBe('FIRST ON PAGE TWO');
    expect(transactions[1].counterparty).toBe('Eva Malá');
  });

  it('reconciles a small synthetic statement (start + Σ == end)', () => {
    const hdr2 = header({
      start: '1 000,00',
      end: '8 976,55',
      credited: '10 000,00',
      debited: '2 023,45',
    });
    const rows = [
      item('01.06.2026', X.date, 700),
      item('Příchozí úhrada', X.typ, 700),
      item('ACME CORP', X.name, 700),
      item('SALARY', X.detail, 700),
      item('10 000,00', X.amount, 700),
      item('0,00', X.fee, 700),
      item('01.06.2026', X.date, 688),
      item('160000000010', X.typ, 688),
      item('9876543210 / 0300', X.name, 688),

      item('02.06.2026', X.date, 660),
      item('Platba kartou', X.typ, 660),
      item('Jan Novák', X.name, 660),
      item('SHOP', X.detail, 660),
      item('-1 988,45', X.amount, 660),
      item('0,00', X.fee, 660),
      item('01.06.2026', X.date, 648),
      item('160000000011', X.typ, 648),
      item('555544******1234', X.name, 648),

      item('03.06.2026', X.date, 620),
      item('Výběr hotovosti', X.typ, 620),
      item('Jan Novák', X.name, 620),
      item('ATM', X.detail, 620),
      item('0,00', X.amount, 620),
      item('-35,00', X.fee, 620),
      item('02.06.2026', X.date, 608),
      item('160000000012', X.typ, 608),
      item('555544******1234', X.name, 608),
    ];
    const { statement, transactions } = parseAirbank([...hdr2, ...rows]);
    const sum = transactions.reduce((a, t) => a + t.amountHalere, 0);
    expect(statement.startingBalanceHalere + sum).toBe(statement.endingBalanceHalere);
    const positives = transactions.filter((t) => t.amountHalere > 0).reduce((a, t) => a + t.amountHalere, 0);
    const negatives = transactions.filter((t) => t.amountHalere < 0).reduce((a, t) => a + t.amountHalere, 0);
    expect(positives).toBe(statement.creditedHalere);
    expect(-negatives).toBe(statement.debitedHalere);
  });
});
