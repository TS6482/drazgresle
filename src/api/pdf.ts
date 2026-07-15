// Client-side PDF text extraction for statement import (see docs/ARCHITECTURE.md
// §6). Statement PDFs are read entirely in the browser and never leave the
// device.
//
// pdfjs-dist is ~1 MB, so it is LAZY-loaded: the `import('pdfjs-dist')` lives
// inside extractTextItems, keeping it out of the main app bundle — the library
// only downloads the first time someone imports a statement. Vite splits it into
// its own chunk (verified in the production build output).
//
// The worker: pdf.js parses on a Web Worker. We hand Vite the worker file via a
// `?url` import (Vite emits it as a hashed static asset and gives us its URL);
// this is a tiny string, not the library itself, so it does not bloat main.

// The worker URL is resolved by Vite at build time to the emitted asset path.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PdfTextItem } from '../engine/parsers/airbank';

/** Thrown when the chosen file cannot be read as a PDF at all. */
export class PdfReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfReadError';
  }
}

let workerConfigured = false;

/**
 * Extract every text fragment from a PDF, across all pages, as positioned items
 * `{ str, x, y, page }`. `y` is pdf.js user-space (origin bottom-left, so larger
 * y = higher on the page) — the Air Bank parser sorts on that convention.
 *
 * Empty/whitespace fragments are kept out at parse time, not here, so this stays
 * a faithful dump of the document.
 */
export async function extractTextItems(file: File): Promise<PdfTextItem[]> {
  let pdfjs: typeof import('pdfjs-dist');
  try {
    pdfjs = await import('pdfjs-dist');
  } catch {
    throw new PdfReadError('Could not load the PDF reader. Check your connection and try again.');
  }

  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    workerConfigured = true;
  }

  let doc;
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    doc = await pdfjs.getDocument({ data }).promise;
  } catch {
    throw new PdfReadError('This file could not be opened as a PDF. Please choose a valid PDF statement.');
  }

  const items: PdfTextItem[] = [];
  try {
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
  } finally {
    // Free the worker-side document; text is already copied into `items`.
    void doc.destroy();
  }

  return items;
}
