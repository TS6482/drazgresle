// Reconcile the Air Bank parser against every real sample statement.
//
//   npx tsx scripts/verify-samples.mts [samples-dir]
//
// For each PDF it extracts pdf.js text items (exactly as the app's loader does),
// runs the production parser, and checks the two invariants that prove the parse
// is complete and correct:
//
//   1. startingBalance + Σ(transaction amounts, fees folded in) == endingBalance
//   2. Σ(positive amounts) == Připsáno  and  Σ(negative amounts) == -Odepsáno
//
// Samples live OUTSIDE the repo (they are real statements) so nothing here is
// committed. This is a dev tool; it is never imported by the app.

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parseAirbank, type PdfTextItem } from '../src/engine/parsers/airbank.ts';

const DEFAULT_DIR = 'C:/ClaudeProjects/statement-samples';

async function extractItems(path: string): Promise<PdfTextItem[]> {
  const data = new Uint8Array(await readFile(path));
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  const items: PdfTextItem[] = [];
  for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
    const page = await doc.getPage(pageNo);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!('str' in item) || item.str === '') {
        continue;
      }
      items.push({
        str: item.str,
        x: item.transform[4],
        y: item.transform[5],
        page: pageNo,
      });
    }
  }
  return items;
}

function fmt(halere: number): string {
  return (halere / 100).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function main() {
  const dir = process.argv[2] ?? DEFAULT_DIR;
  const files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith('.pdf')).sort();
  if (files.length === 0) {
    console.error(`No PDFs found in ${dir}`);
    process.exit(1);
  }

  let allOk = true;
  console.log('');
  for (const file of files) {
    const items = await extractItems(join(dir, file));
    const { statement, transactions } = parseAirbank(items);

    const sum = transactions.reduce((a, t) => a + t.amountHalere, 0);
    const positives = transactions.filter((t) => t.amountHalere > 0).reduce((a, t) => a + t.amountHalere, 0);
    const negatives = transactions.filter((t) => t.amountHalere < 0).reduce((a, t) => a + t.amountHalere, 0);

    const computedEnd = statement.startingBalanceHalere + sum;
    const balanceOk = computedEnd === statement.endingBalanceHalere;
    const creditOk = positives === statement.creditedHalere;
    const debitOk = -negatives === statement.debitedHalere;
    const ok = balanceOk && creditOk && debitOk;
    allOk = allOk && ok;

    console.log(`${ok ? 'PASS' : 'FAIL'}  ${file}`);
    console.log(`   period ${statement.periodStart} … ${statement.periodEnd}   account ${statement.accountNumber}   ${transactions.length} tx`);
    console.log(`   start ${fmt(statement.startingBalanceHalere)} + Σ ${fmt(sum)} = ${fmt(computedEnd)}   (end ${fmt(statement.endingBalanceHalere)})  ${balanceOk ? 'OK' : 'MISMATCH'}`);
    console.log(`   credited Σ+ ${fmt(positives)} vs ${fmt(statement.creditedHalere)} ${creditOk ? 'OK' : 'MISMATCH'}   |   debited Σ- ${fmt(-negatives)} vs ${fmt(statement.debitedHalere)} ${debitOk ? 'OK' : 'MISMATCH'}`);
    console.log('');
  }

  console.log(allOk ? 'ALL SAMPLES RECONCILE ✓' : 'SOME SAMPLES FAILED ✗');
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
