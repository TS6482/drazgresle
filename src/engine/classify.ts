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

/** Longest primary-line vendor text before truncation kicks in. */
const VENDOR_MAX_CHARS = 40;

/** Shown when a transaction has no usable text in any field. */
const VENDOR_FALLBACK = '—';

/** Cap a vendor string at ~{@link VENDOR_MAX_CHARS} chars with an ellipsis. */
function truncateVendor(text: string): string {
  if (text.length <= VENDOR_MAX_CHARS) {
    return text;
  }
  return `${text.slice(0, VENDOR_MAX_CHARS - 1).trimEnd()}…`;
}

/**
 * The vendor a transaction row should LEAD with, so misclassifications are
 * spottable at a glance:
 *
 * - Card rows (see {@link isCardRow}): the counterparty is the cardholder —
 *   always one of the two spouses, useless — so the merchant from the
 *   description leads instead, then the counterparty, then the description.
 * - Other rows with a counterparty name: that name (transfers, salary, …).
 * - Otherwise the description's merchant segment (or the description itself,
 *   truncated), then the counterparty account as a last identifier.
 *
 * Never returns an empty string — `'—'` when every field is blank.
 */
export function displayVendor(tx: ClassifiableTransaction): string {
  const counterparty = tx.counterparty.trim();
  const description = tx.description.trim();

  if (isCardRow(tx)) {
    const merchant = extractMerchant(description);
    if (merchant) {
      return truncateVendor(merchant);
    }
    if (counterparty) {
      return counterparty;
    }
    return description ? truncateVendor(description) : VENDOR_FALLBACK;
  }

  if (counterparty) {
    return counterparty;
  }

  const merchant = extractMerchant(description);
  if (merchant) {
    return truncateVendor(merchant);
  }
  if (description) {
    return truncateVendor(description);
  }

  const account = tx.counterpartyAccount?.trim();
  return account ? account : VENDOR_FALLBACK;
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
 * The rule `classify` would apply to a transaction, or `null` when none match.
 * `exact` rules are considered before `contains`; the first matching rule in
 * file order wins within each pass.
 */
export function matchingRule(tx: ClassifiableTransaction, rules: Rule[]): Rule | null {
  for (const rule of rules) {
    // Account rules and explicit `exact` rules form the high-priority pass.
    const isExact = rule.field === 'counterpartyAccount' || rule.match === 'exact';
    if (isExact && ruleMatches(rule, tx)) {
      return rule;
    }
  }
  for (const rule of rules) {
    const isExact = rule.field === 'counterpartyAccount' || rule.match === 'exact';
    if (!isExact && ruleMatches(rule, tx)) {
      return rule;
    }
  }
  return null;
}

/**
 * The category id the rules assign to a transaction, or `null` if none match.
 * Precedence is decided by {@link matchingRule}.
 */
export function classify(tx: ClassifiableTransaction, rules: Rule[]): string | null {
  return matchingRule(tx, rules)?.categoryId ?? null;
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

/**
 * Rule suggestion for a STORED transaction (a MonthView correction rather than
 * an import review). Rows imported before `bankType`/`counterpartyAccount`
 * were persisted lack both (not backfillable — the data is gone from the
 * stored form) — so for an old Air Bank row the counterparty may well be the
 * cardholder even when we cannot prove it. Description-based merchant patterns
 * are therefore the safer default here:
 *
 * 1. A persisted counterparty account → account-exact, as on import.
 * 2. Card rows (bankType says so) → merchant `contains` rule, as on import.
 * 3. Any row whose description yields a merchant → description `contains`.
 * 4. Otherwise → counterparty exact.
 *
 * The editable pattern input in the UI is the user's control over how broad
 * the rule is. Returns `null` when nothing usable exists.
 */
export function suggestRuleForStored(
  tx: ClassifiableTransaction,
  categoryId: string,
): Rule | null {
  // suggestRule puts the account first and handles the card-row policy.
  if (tx.counterpartyAccount?.trim() || isCardRow(tx)) {
    return suggestRule(tx, categoryId);
  }
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

/**
 * The match mode a user-confirmed rule should use: account rules stay exact;
 * a counterparty rule stays exact only while its pattern is untouched
 * (shortening it implies substring matching); description/merchant rules are
 * always `contains`. Shared by the import review and the MonthView editor.
 */
export function ruleMatchFor(
  field: RuleField,
  pattern: string,
  suggested: string,
): Rule['match'] {
  if (field === 'counterpartyAccount') {
    return 'exact';
  }
  if (field === 'counterparty') {
    return pattern.trim().toLowerCase() === suggested.trim().toLowerCase()
      ? 'exact'
      : 'contains';
  }
  return 'contains';
}

/**
 * The rule upserts needed so that `target` decides `tx`'s category from now on
 * — the "correction = learning" path when a rule may already exist (possibly
 * the one that classified `tx` wrongly).
 *
 * Semantics (mirrors the store's rules merge, which UPDATES known ids in place
 * and PREPENDS unknown ids so newer intent outranks older rules of the same
 * match class):
 *
 * 1. A rule with the same field+pattern (case-insensitive) is retargeted in
 *    place — no duplicate rule is created.
 * 2. Otherwise `target` is a new rule; prepending lets it win every tie
 *    within its match class.
 * 3. If after that an OLD rule would still outrank the result for this
 *    transaction (an `exact` rule beats a new `contains` — e.g. the wrong
 *    classification came from a counterparty-exact rule while the correction
 *    is a merchant rule), that winning rule is retargeted too. Exact rules
 *    are vendor-specific by construction, so retargeting them is safe.
 */
export function planRuleUpdate(
  rules: Rule[],
  tx: ClassifiableTransaction,
  target: Rule,
): Rule[] {
  const patternKey = target.pattern.trim().toLowerCase();
  const existing = rules.find(
    (r) => r.field === target.field && r.pattern.trim().toLowerCase() === patternKey,
  );
  const applied: Rule = existing
    ? { ...existing, match: target.match, categoryId: target.categoryId }
    : target;
  const upserts: Rule[] = [applied];

  // Simulate the store merge (update in place / prepend new) and check who wins.
  const simulated = existing
    ? rules.map((r) => (r.id === existing.id ? applied : r))
    : [applied, ...rules];
  const winner = matchingRule(tx, simulated);
  if (winner && winner.categoryId !== target.categoryId) {
    upserts.push({ ...winner, categoryId: target.categoryId });
  }
  return upserts;
}
