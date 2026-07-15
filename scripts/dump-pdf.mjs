// Dump the pdf.js text items of a statement PDF as JSON, one array per page,
// each item `{ str, x, y, page }`. This mirrors exactly what the production
// loader (src/api/pdf.ts) feeds the parser, so it is the tool for studying the
// Air Bank layout coordinates and reconciling parser output against the source.
//
//   node scripts/dump-pdf.mjs <path-to.pdf> [out.json]
//
// With no out path it prints a compact, human-readable per-page listing to
// stdout (y then x sorted); with an out path it writes the raw JSON array.
//
// Uses the app's own pdfjs-dist dependency (legacy Node build). Never imported
// by the app — a dev/analysis tool only.

import { readFile, writeFile } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

async function extractItems(path) {
  const data = new Uint8Array(await readFile(path));
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  const items = [];
  for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
    const page = await doc.getPage(pageNo);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!('str' in item)) {
        continue;
      }
      const str = item.str;
      if (str === '') {
        continue;
      }
      // transform = [a, b, c, d, e, f]; e = x, f = y (PDF user space, origin
      // bottom-left). The loader flips y so smaller = higher on the page.
      const x = item.transform[4];
      const y = item.transform[5];
      items.push({ str, x: round(x), y: round(y), page: pageNo });
    }
  }
  return items;
}

function round(n) {
  return Math.round(n * 100) / 100;
}

async function main() {
  const [, , pdfPath, outPath] = process.argv;
  if (!pdfPath) {
    console.error('usage: node scripts/dump-pdf.mjs <path-to.pdf> [out.json]');
    process.exit(1);
  }
  const items = await extractItems(pdfPath);
  if (outPath) {
    await writeFile(outPath, JSON.stringify(items, null, 2), 'utf8');
    console.error(`wrote ${items.length} items to ${outPath}`);
    return;
  }
  // Pretty per-page listing, top-down (descending y in PDF space), then left-right.
  const pages = new Map();
  for (const it of items) {
    if (!pages.has(it.page)) {
      pages.set(it.page, []);
    }
    pages.get(it.page).push(it);
  }
  for (const [page, pageItems] of [...pages.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`\n===== PAGE ${page} (${pageItems.length} items) =====`);
    pageItems
      .sort((a, b) => b.y - a.y || a.x - b.x)
      .forEach((it) => {
        console.log(`y=${it.y.toFixed(1).padStart(7)} x=${it.x.toFixed(1).padStart(7)}  ${JSON.stringify(it.str)}`);
      });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
