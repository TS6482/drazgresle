// Rule-based transaction classification. Pure — no React, no I/O. Given a
// transaction and the user's rules, decide its category; and given a correction,
// suggest a rule so future imports of the same vendor auto-classify (see
// docs/ARCHITECTURE.md §6, "Correction = learning").
//
// Precedence (confirmed): `exact` matches beat `contains`; within the same match
// type the first rule in the file wins; all comparisons are case-insensitive;
// `counterpartyAccount` rules are only ever `exact`.

import type { Rule, RuleField } from '../types/data';
import { newId } from '../utils/id';

/**
 * The minimum a transaction must expose to be classified. Both a freshly parsed
 * statement row (which carries `counterpartyAccount`) and a stored transaction
 * (which does not) satisfy this shape.
 */
export interface ClassifiableTransaction {
  counterparty: string;
  description: string;
  counterpartyAccount?: string;
  /** The bank's Typ string (e.g. "Platba kartou"); absent on cash/manual rows. */
  bankType?: string;
}

/**
 * Bank types whose `counterparty` is the CARDHOLDER, not the vendor — card
 * payments ("Platba kartou") and card cash withdrawals ("Výběr hotovosti").
 * For these rows the vendor lives in the description, so learning a
 * counterparty rule would (dangerously) match every card payment by that
 * person; merchant-based description rules are used instead.
 */
const CARD_TYPE_RE = /kartou|hotovosti/i;

/** True when a row's counterparty names the cardholder rather than a vendor. */
function isCardRow(tx: ClassifiableTransaction): boolean {
  return tx.bankType !== undefined && CARD_TYPE_RE.test(tx.bankType);
}

/**
 * The merchant part of a card payment's description: the first segment up to
 * the first comma, trimmed — e.g. `"BURGER PALACE OC PLAZA 12, BRNO, 60200"` →
 * `"BURGER PALACE OC PLAZA 12"`. Returns `null` when nothing usable remains.
 */
export function extractMerchant(description: string): string | null {
  const first = description.split(',')[0].trim();
  return first === '' ? null : first;
}

/** The value of the field a rule tests, or `''` when absent. */
function fieldValue(tx: ClassifiableTransaction, field: RuleField): string {
  if (field === 'counterparty') {
    return tx.counterparty;
  }
  if (field === 'description') {
    return tx.description;
  }
  return tx.counterpartyAccount ?? '';
}

/** Whether a single rule matches a transaction (case-insensitive). */
function ruleMatches(rule: Rule, tx: ClassifiableTransaction): boolean {
  const value = fieldValue(tx, rule.field).toLowerCase().trim();
  const pattern = rule.pattern.toLowerCase().trim();
  if (value === '' || pattern === '') {
    return false;
  }
  // counterpartyAccount is always compared exactly, whatever `match` says.
  if (rule.field === 'counterpartyAccount') {
    return value === pattern;
  }
  if (rule.match === 'exact') {
    return value === pattern;
  }
  return value.includes(pattern);
}

/**
 * The category id the rules assign to a transaction, or `null` if none match.
 * `exact` rules are considered before `contains`; the first matching rule in
 * file order wins within each pass.
 */
export function classify(tx: ClassifiableTransaction, rules: Rule[]): string | null {
  for (const rule of rules) {
    // Account rules and explicit `exact` rules form the high-priority pass.
    const isExact = rule.field === 'counterpartyAccount' || rule.match === 'exact';
    if (isExact && ruleMatches(rule, tx)) {
      return rule.categoryId;
    }
  }
  for (const rule of rules) {
    const isExact = rule.field === 'counterpartyAccount' || rule.match === 'exact';
    if (!isExact && ruleMatches(rule, tx)) {
      return rule.categoryId;
    }
  }
  return null;
}

/**
 * Build a sensible rule from a user's classification of a transaction:
 *
 * 1. Counterparty account, exactly, when the transaction has one — the most
 *    reliable key.
 * 2. For card rows (see {@link isCardRow}) or rows with no counterparty at all,
 *    the vendor lives in the description: a case-insensitive `contains` rule on
 *    the extracted merchant (which the UI lets the user shorten, e.g.
 *    "BURGER PALACE OC PLAZA 12" → "BURGER PALACE").
 * 3. Otherwise the counterparty name, exactly.
 *
 * Returns `null` when nothing usable exists to key on — notably a card row
 * with an empty description: its counterparty is the cardholder, and a rule on
 * that would swallow every card payment by that person.
 */
export function suggestRule(
  tx: ClassifiableTransaction,
  categoryId: string,
): Rule | null {
  const account = tx.counterpartyAccount?.trim();
  if (account) {
    return {
      id: newId('rule'),
      field: 'counterpartyAccount',
      match: 'exact',
      pattern: account,
      categoryId,
      createdFrom: tx.counterparty || tx.description,
    };
  }
  const cardLike = isCardRow(tx) || tx.counterparty.trim() === '';
  if (cardLike) {
    const merchant = extractMerchant(tx.description);
    if (merchant) {
      return {
        id: newId('rule'),
        field: 'description',
        match: 'contains',
        pattern: merchant,
        categoryId,
        createdFrom: tx.description,
      };
    }
    // A card row with no usable description: never fall back to the
    // counterparty — it names the cardholder, not the vendor.
    if (isCardRow(tx)) {
      return null;
    }
  }
  const counterparty = tx.counterparty.trim();
  if (counterparty) {
    return {
      id: newId('rule'),
      field: 'counterparty',
      match: 'exact',
      pattern: counterparty,
      categoryId,
      createdFrom: tx.counterparty,
    };
  }
  return null;
}
