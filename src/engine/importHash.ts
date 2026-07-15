// Stable content hash for statement-import deduplication. When the same
// statement is uploaded twice (or two exports overlap), identical rows produce
// identical hashes, so the importer can skip a transaction it already has.
//
// The hash is computed over the tuple (date, amount, counterparty, description)
// exactly as recorded on the transaction — see docs/ARCHITECTURE.md §4. It is a
// content fingerprint, not a cryptographic hash: it only needs to be stable and
// well-distributed. FNV-1a (32-bit) is tiny, dependency-free, and deterministic
// across every JS engine, so the same statement hashes identically on both
// spouses' phones.
//
// Note (documented limitation): two genuinely distinct transactions that share
// the same date, amount, counterparty and description (e.g. two identical coffee
// purchases on one day) collapse to one hash and the second would be treated as
// a duplicate. This matches the confirmed dedupe design; the bank's unique
// transaction code is deliberately NOT part of the fingerprint.

/** FNV-1a 32-bit offset basis. */
const FNV_OFFSET = 0x811c9dc5;
/** FNV-1a 32-bit prime. */
const FNV_PRIME = 0x01000193;

/** FNV-1a hash of a string → unsigned 32-bit integer. */
function fnv1a(input: string): number {
  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i) & 0xff;
    // Charcodes above 0xff (accented Czech letters) also feed the high byte so
    // "Dvořák" and "Dvorak" don't collide.
    if (input.charCodeAt(i) > 0xff) {
      hash = Math.imul(hash, FNV_PRIME);
      hash ^= (input.charCodeAt(i) >> 8) & 0xff;
    }
    hash = Math.imul(hash, FNV_PRIME);
  }
  // Math.imul yields a signed 32-bit int; coerce to unsigned.
  return hash >>> 0;
}

/** The fields that identify a transaction for dedupe. */
export interface ImportHashInput {
  date: string;
  amountHalere: number;
  counterparty: string;
  description: string;
}

/**
 * Stable 8-hex-character fingerprint of a transaction, used to dedupe on import.
 * Fields are joined with `|` (a character that never appears in a normalized
 * amount and is vanishingly rare in bank text) so field boundaries can't blur.
 */
export function importHash(input: ImportHashInput): string {
  const key = `${input.date}|${input.amountHalere}|${input.counterparty}|${input.description}`;
  return fnv1a(key).toString(16).padStart(8, '0');
}
