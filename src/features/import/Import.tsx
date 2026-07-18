import { useMemo, useState } from 'react';
import type { Category, Rule, RuleField, StatementMeta, Transaction } from '../../types/data';
import { extractTextItems, PdfReadError } from '../../api/pdf';
import {
  AirbankParseError,
  parseAirbank,
  type AirbankStatement,
  type ParsedTransaction,
} from '../../engine/parsers/airbank';
import { importHash } from '../../engine/importHash';
import {
  classifiableFromParsed,
  classify,
  displayVendor,
  ruleMatchFor,
  suggestRule,
} from '../../engine/classify';
import { formatKc } from '../../engine/money';
import { monthKey, SAVINGS_TRANSFERS_CATEGORY_ID } from '../../engine/summarize';
import { useDataStore } from '../../store/data';
import { navigate } from '../../router/useHashRoute';
import { formatDayMonth } from '../../utils/dates';
import { newId } from '../../utils/id';
import { CategoryPicker } from '../shared/CategoryPicker';
import styles from './Import.module.css';

type Step = 'pick' | 'review' | 'done';

/** One parsed row under review. Classification decisions live OUTSIDE this
 *  object (group decisions / row corrections) so they derive and undo cleanly. */
interface ReviewItem {
  id: string;
  parsed: ParsedTransaction;
  importHash: string;
  bookingMonth: string;
  /** What the saved rules said at parse time (null = unclassified). */
  autoCategoryId: string | null;
}

/**
 * Unclassified rows sharing the same suggested rule key (same vendor account /
 * merchant / counterparty) are reviewed as ONE decision — "BURGER PALACE… — 4
 * transactions". `field === null` means no rule can be learned from these rows
 * (they can still be categorized as a group).
 */
interface ReviewGroup {
  key: string;
  label: string;
  field: RuleField | null;
  suggestedPattern: string;
  memberIds: string[];
  /** The user's decision for every member (null = not decided yet). */
  categoryId: string | null;
  /** Save a rule from this decision on commit. */
  addRule: boolean;
  /** The rule pattern, pre-filled with the suggestion and user-editable. */
  pattern: string;
  /** When the group's account-exact key is one of the household's own accounts,
   *  its name — the group is pre-filled as a savings transfer and labelled. */
  ownAccountName?: string;
}

/** A correction of an auto-classified row, with its optional learned rule. */
interface RowEdit {
  categoryId: string | null;
  addRule: boolean;
  pattern: string;
  field: RuleField | null;
  suggestedPattern: string;
}

interface CommitResult {
  imported: number;
  duplicates: number;
  rulesCreated: number;
  monthsTouched: string[];
}

/** Build the pending (not yet saved) rule from a decision, or null. */
function pendingRuleFrom(
  field: RuleField | null,
  pattern: string,
  suggested: string,
  categoryId: string | null,
  addRule: boolean,
  createdFrom: string,
): Rule | null {
  if (field === null || categoryId === null || !addRule || pattern.trim() === '') {
    return null;
  }
  return {
    id: newId('rule'),
    field,
    match: ruleMatchFor(field, pattern, suggested),
    pattern: pattern.trim(),
    categoryId,
    createdFrom,
  };
}

export function Import() {
  const rules = useDataStore((s) => s.rules);
  const categories = useDataStore((s) => s.categories);
  const accounts = useDataStore((s) => s.accounts);
  const loadMonth = useDataStore((s) => s.loadMonth);
  const saveRules = useDataStore((s) => s.saveRules);
  const saveImport = useDataStore((s) => s.saveImport);
  const saving = useDataStore((s) => s.saving);

  const [step, setStep] = useState<Step>('pick');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [statement, setStatement] = useState<AirbankStatement['statement'] | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [groups, setGroups] = useState<ReviewGroup[]>([]);
  const [rowEdits, setRowEdits] = useState<Record<string, RowEdit>>({});
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [result, setResult] = useState<CommitResult | null>(null);

  const byId = useMemo(
    () => new Map<string, Category>(categories.map((c) => [c.id, c])),
    [categories],
  );

  /** The app account this statement maps to (statement-driven Air Bank account). */
  const airbankAccountId = useMemo(
    () => accounts.find((a) => a.statementSource === 'airbank' && a.active)?.id ?? '',
    [accounts],
  );

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  /** Rules that WOULD be saved right now — they classify remaining rows live. */
  const pendingRules = useMemo(() => {
    const out: Rule[] = [];
    for (const g of groups) {
      const r = pendingRuleFrom(g.field, g.pattern, g.suggestedPattern, g.categoryId, g.addRule, g.label);
      if (r) {
        out.push(r);
      }
    }
    for (const [id, edit] of Object.entries(rowEdits)) {
      const item = itemById.get(id);
      if (!item) {
        continue;
      }
      const r = pendingRuleFrom(
        edit.field,
        edit.pattern,
        edit.suggestedPattern,
        edit.categoryId,
        edit.addRule,
        item.parsed.counterparty || item.parsed.description,
      );
      if (r) {
        out.push(r);
      }
    }
    return out;
  }, [groups, rowEdits, itemById]);

  const groupOf = useMemo(() => {
    const map = new Map<string, ReviewGroup>();
    for (const g of groups) {
      for (const id of g.memberIds) {
        map.set(id, g);
      }
    }
    return map;
  }, [groups]);

  /**
   * Effective category per row: an explicit row correction wins, then the row's
   * group decision, then — for still-unclassified rows — any pending rule
   * (instant propagation across the import), then the parse-time auto result.
   */
  const effective = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const item of items) {
      const edit = rowEdits[item.id];
      if (edit) {
        map.set(item.id, edit.categoryId);
        continue;
      }
      const group = groupOf.get(item.id);
      if (group && group.categoryId !== null) {
        map.set(item.id, group.categoryId);
        continue;
      }
      if (item.autoCategoryId === null && pendingRules.length > 0) {
        map.set(item.id, classify(item.parsed, pendingRules));
        continue;
      }
      map.set(item.id, item.autoCategoryId);
    }
    return map;
  }, [items, rowEdits, groupOf, pendingRules]);

  const unclassifiedCount = items.filter((i) => effective.get(i.id) === null).length;

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const textItems = await extractTextItems(file);
      const parsed = parseAirbank(textItems);

      // The statement may straddle a month boundary; load every touched month so
      // we can dedupe against what is already stored.
      const touchedMonths = new Set<string>(parsed.transactions.map((t) => monthKey(t.date)));
      touchedMonths.add(monthKey(parsed.statement.periodEnd));
      await Promise.all([...touchedMonths].map((m) => loadMonth(m)));

      // Existing import hashes across the touched months.
      const monthsNow = useDataStore.getState().months;
      const seen = new Set<string>();
      for (const m of touchedMonths) {
        for (const tx of monthsNow[m] ?? []) {
          if (tx.importHash !== undefined) {
            seen.add(tx.importHash);
          }
        }
      }

      // Drop rows already present (same statement re-uploaded / overlap).
      const fresh: ReviewItem[] = [];
      let dupes = 0;
      const batchSeen = new Set<string>();
      for (const p of parsed.transactions) {
        const hash = importHash({
          date: p.date,
          amountHalere: p.amountHalere,
          counterparty: p.counterparty,
          description: p.description,
        });
        if (seen.has(hash) || batchSeen.has(hash)) {
          dupes += 1;
          continue;
        }
        batchSeen.add(hash);
        fresh.push({
          id: newId('imp'),
          parsed: p,
          importHash: hash,
          bookingMonth: monthKey(p.date),
          autoCategoryId: classify(classifiableFromParsed(p), rules),
        });
      }

      // Own account numbers → account name, for flagging transfers to the
      // household's own accounts. Only meaningful when a savings-transfers
      // category exists to route them to; absent → the map stays empty and
      // behaviour is identical to before.
      const ownAccountByNumber = new Map<string, string>();
      if (categories.some((c) => c.id === SAVINGS_TRANSFERS_CATEGORY_ID)) {
        for (const acc of accounts) {
          const num = acc.accountNumber?.trim();
          if (num) {
            ownAccountByNumber.set(num, acc.name);
          }
        }
      }

      // Group the unclassified rows by their suggested rule key, so one
      // decision covers every occurrence of the same vendor.
      const groupMap = new Map<string, ReviewGroup>();
      for (const item of fresh) {
        if (item.autoCategoryId !== null) {
          continue;
        }
        const s = suggestRule(classifiableFromParsed(item.parsed), 'x');
        const key = s ? `${s.field}|${s.pattern.toLowerCase()}` : `solo-${item.id}`;
        let g = groupMap.get(key);
        if (!g) {
          // An account-exact key matching one of our own accounts starts as a
          // savings transfer (one less decision; addRule stays true, so
          // committing learns the account rule for future imports).
          const ownAccountName =
            s?.field === 'counterpartyAccount'
              ? ownAccountByNumber.get(s.pattern.trim())
              : undefined;
          g = {
            key,
            label:
              s?.field === 'counterpartyAccount'
                ? item.parsed.counterparty || s.pattern
                : (s?.pattern ??
                  (item.parsed.counterparty || item.parsed.description || item.parsed.type)),
            field: s?.field ?? null,
            suggestedPattern: s?.pattern ?? '',
            memberIds: [],
            categoryId: ownAccountName !== undefined ? SAVINGS_TRANSFERS_CATEGORY_ID : null,
            addRule: s !== null,
            pattern: s?.pattern ?? '',
          };
          if (ownAccountName !== undefined) {
            g.ownAccountName = ownAccountName;
          }
          groupMap.set(key, g);
        }
        g.memberIds.push(item.id);
      }

      setStatement(parsed.statement);
      setItems(fresh);
      setGroups([...groupMap.values()]);
      setRowEdits({});
      setDuplicateCount(dupes);
      setFileName(file.name);
      setStep('review');
    } catch (err) {
      if (err instanceof AirbankParseError || err instanceof PdfReadError) {
        setError(err.message);
      } else {
        setError('Something went wrong reading this statement. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  function updateGroup(key: string, patch: Partial<ReviewGroup>) {
    setGroups((prev) => prev.map((g) => (g.key === key ? { ...g, ...patch } : g)));
  }

  function editRow(item: ReviewItem, categoryId: string | null) {
    const s =
      categoryId !== null ? suggestRule(classifiableFromParsed(item.parsed), categoryId) : null;
    setRowEdits((prev) => ({
      ...prev,
      [item.id]: {
        categoryId,
        addRule: s !== null,
        pattern: s?.pattern ?? '',
        field: s?.field ?? null,
        suggestedPattern: s?.pattern ?? '',
      },
    }));
  }

  function updateRowEdit(itemId: string, patch: Partial<RowEdit>) {
    setRowEdits((prev) => {
      const current = prev[itemId];
      if (!current) {
        return prev;
      }
      return { ...prev, [itemId]: { ...current, ...patch } };
    });
  }

  async function handleCommit() {
    if (statement === null) {
      return;
    }
    setBusy(true);
    setError(null);

    // De-duplicate the learned rules by field+pattern.
    const ruleByKey = new Map<string, Rule>();
    for (const rule of pendingRules) {
      ruleByKey.set(`${rule.field}|${rule.pattern.toLowerCase()}`, rule);
    }
    const newRules = [...ruleByKey.values()];

    // Group transactions by their booking month; attach statement metadata to
    // the month of the period end (its ending balance drives the auto-balance).
    const statementMonth = monthKey(statement.periodEnd);
    const perMonth: Record<string, { transactions: Transaction[]; statement?: StatementMeta }> = {};
    const ensure = (m: string) => {
      if (!perMonth[m]) {
        perMonth[m] = { transactions: [] };
      }
      return perMonth[m];
    };

    for (const item of items) {
      const tx: Transaction = {
        id: newId('tx'),
        date: item.parsed.date,
        amountHalere: item.parsed.amountHalere,
        counterparty: item.parsed.counterparty,
        description: item.parsed.description,
        account: airbankAccountId,
        categoryId: effective.get(item.id) ?? null,
        source: 'airbank',
        importHash: item.importHash,
      };
      if (item.parsed.type !== '') {
        tx.bankType = item.parsed.type;
      }
      // Persist the counterparty account so account-exact rules can match this
      // row later (retroactive Auto-classify, inline corrections).
      if (item.parsed.counterpartyAccount !== undefined) {
        tx.counterpartyAccount = item.parsed.counterpartyAccount;
      }
      ensure(item.bookingMonth).transactions.push(tx);
    }

    const meta: StatementMeta = {
      source: 'airbank',
      periodStart: statement.periodStart,
      periodEnd: statement.periodEnd,
      startingBalanceHalere: statement.startingBalanceHalere,
      endingBalanceHalere: statement.endingBalanceHalere,
      accountNumber: statement.accountNumber,
    };
    ensure(statementMonth).statement = meta;

    // Save rules first (harmless if the import then fails), then the months.
    if (newRules.length > 0) {
      const ok = await saveRules(newRules);
      if (!ok) {
        setBusy(false);
        setError('Could not save the new classification rules. Please try again.');
        return;
      }
    }

    const ok = await saveImport(perMonth);
    setBusy(false);
    if (!ok) {
      setError('Could not save the imported transactions. Please try again.');
      return;
    }

    setResult({
      imported: items.length,
      duplicates: duplicateCount,
      rulesCreated: newRules.length,
      monthsTouched: Object.keys(perMonth).sort(),
    });
    setStep('done');
  }

  function reset() {
    setStep('pick');
    setStatement(null);
    setItems([]);
    setGroups([]);
    setRowEdits({});
    setDuplicateCount(0);
    setResult(null);
    setError(null);
    setFileName('');
  }

  function categoryName(categoryId: string | null): string {
    if (categoryId === null) {
      return 'Uncategorized';
    }
    return byId.get(categoryId)?.name ?? categoryId;
  }

  // Groups: undecided first (largest first), decided sink but stay editable.
  const orderedGroups = useMemo(() => {
    const decided = (g: ReviewGroup) => {
      const first = g.memberIds[0];
      return first !== undefined && effective.get(first) !== null;
    };
    return [...groups].sort((a, b) => {
      const ad = decided(a) ? 1 : 0;
      const bd = decided(b) ? 1 : 0;
      if (ad !== bd) {
        return ad - bd;
      }
      return b.memberIds.length - a.memberIds.length;
    });
  }, [groups, effective]);

  // Auto-classified rows (saved rules matched at parse time), newest first.
  const classifiedRows = useMemo(
    () =>
      items
        .filter((i) => i.autoCategoryId !== null)
        .sort((a, b) => b.parsed.date.localeCompare(a.parsed.date)),
    [items],
  );

  function renderPatternEditor(
    idPrefix: string,
    field: RuleField | null,
    categoryId: string | null,
    addRule: boolean,
    pattern: string,
    vendorLabel: string,
    onToggle: (checked: boolean) => void,
    onPattern: (value: string) => void,
  ) {
    if (field === null || categoryId === null) {
      return null;
    }
    return (
      <div className={styles.ruleBox}>
        <label className={styles.ruleRow} htmlFor={`${idPrefix}-chk`}>
          <input
            id={`${idPrefix}-chk`}
            type="checkbox"
            checked={addRule}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <span>
            Always classify <strong>{vendorLabel}</strong> as{' '}
            <strong>{categoryName(categoryId)}</strong>
          </span>
        </label>
        {addRule && field !== 'counterpartyAccount' && (
          <div className={styles.patternRow}>
            <label className={styles.patternLabel} htmlFor={`${idPrefix}-pat`}>
              matching text
            </label>
            <input
              id={`${idPrefix}-pat`}
              className={styles.patternInput}
              type="text"
              autoComplete="off"
              value={pattern}
              onChange={(e) => onPattern(e.target.value)}
              aria-invalid={pattern.trim() === ''}
            />
            {pattern.trim() === '' ? (
              <span className={styles.patternError} role="alert">
                Enter the text to match — the rule is skipped while this is empty.
              </span>
            ) : (
              <span className={styles.patternHint}>
                Shorten it to match more (e.g. just the shop name). Applies to future imports too.
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderGroup(group: ReviewGroup) {
    const members = group.memberIds
      .map((id) => itemById.get(id))
      .filter((i): i is ReviewItem => i !== undefined);
    const first = members[0];
    if (!first) {
      return null;
    }
    const total = members.reduce((a, m) => a + m.parsed.amountHalere, 0);
    const effectiveCat = effective.get(first.id) ?? null;
    // Undecided here but covered by ANOTHER decision's pending rule.
    const viaRule = group.categoryId === null && effectiveCat !== null;
    return (
      <li key={group.key} className={styles.row}>
        <div className={styles.rowTop}>
          <span className={styles.who}>{group.label}</span>
          <span className={`${styles.amount} ${total > 0 ? styles.income : ''}`}>
            {formatKc(total)}
          </span>
        </div>
        <div className={styles.rowMeta}>
          <span className={styles.type}>{first.parsed.type}</span>
          <span className={styles.date}>
            {members.length === 1
              ? formatDayMonth(first.parsed.date)
              : `${members.length} transactions`}
          </span>
          {viaRule && <span className={styles.viaRule}>matched by your new rule</span>}
        </div>
        {group.ownAccountName && (
          <span className={styles.ownAccount}>
            → your own account: {group.ownAccountName} — counted as savings transfer
          </span>
        )}
        {first.parsed.description && first.parsed.description !== group.label && (
          <span className={styles.desc}>{first.parsed.description}</span>
        )}
        <CategoryPicker
          id={`grp-${group.key}`}
          value={group.categoryId ?? effectiveCat}
          onChange={(categoryId) => updateGroup(group.key, { categoryId })}
          categories={categories}
          includeNone
          noneLabel="Choose a category…"
        />
        {renderPatternEditor(
          `grp-${group.key}`,
          group.field,
          group.categoryId,
          group.addRule,
          group.pattern,
          group.label,
          (checked) => updateGroup(group.key, { addRule: checked }),
          (value) => updateGroup(group.key, { pattern: value }),
        )}
      </li>
    );
  }

  function renderClassifiedRow(item: ReviewItem) {
    const p = item.parsed;
    const edit = rowEdits[item.id];
    const cat = effective.get(item.id) ?? null;
    // Lead with the vendor (merchant for card rows — the counterparty is just
    // the cardholder), same as the month view.
    const vendor = displayVendor(classifiableFromParsed(p));
    return (
      <li key={item.id} className={styles.row}>
        <div className={styles.rowTop}>
          <span className={styles.who}>{vendor}</span>
          <span className={`${styles.amount} ${p.amountHalere > 0 ? styles.income : ''}`}>
            {formatKc(p.amountHalere)}
          </span>
        </div>
        <div className={styles.rowMeta}>
          <span className={styles.date}>{formatDayMonth(p.date)}</span>
          <span className={styles.type}>{p.type}</span>
        </div>
        {p.description && p.description !== vendor && (
          <span className={styles.desc}>{p.description}</span>
        )}
        <CategoryPicker
          id={`imp-cat-${item.id}`}
          value={cat}
          onChange={(categoryId) => editRow(item, categoryId)}
          categories={categories}
          includeNone
          noneLabel="Uncategorized"
        />
        {edit &&
          edit.categoryId !== null &&
          edit.categoryId !== item.autoCategoryId &&
          renderPatternEditor(
            `row-${item.id}`,
            edit.field,
            edit.categoryId,
            edit.addRule,
            edit.pattern,
            edit.field === 'counterpartyAccount'
              ? p.counterparty || edit.suggestedPattern
              : edit.suggestedPattern,
            (checked) => updateRowEdit(item.id, { addRule: checked }),
            (value) => updateRowEdit(item.id, { pattern: value }),
          )}
      </li>
    );
  }

  // --- render ---------------------------------------------------------------

  if (step === 'pick') {
    return (
      <section className={styles.screen}>
        <h1 className={styles.heading}>Import statement</h1>
        <p className={styles.muted}>
          Choose an Air Bank current-account statement PDF. It is read on your phone only — the
          file never leaves your device.
        </p>

        <label className={styles.picker}>
          <input
            type="file"
            accept="application/pdf"
            className={styles.fileInput}
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Reset the input so re-picking the same file fires onChange again.
              e.target.value = '';
              if (file) {
                void handleFile(file);
              }
            }}
          />
          <span className={styles.pickerLabel}>{busy ? 'Reading…' : 'Choose PDF'}</span>
        </label>

        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}

        <button type="button" className={styles.secondary} onClick={() => navigate('/month')}>
          Cancel
        </button>
      </section>
    );
  }

  if (step === 'review' && statement) {
    return (
      <section className={styles.screen}>
        <h1 className={styles.heading}>Review import</h1>

        <div className={styles.group}>
          <h2 className={styles.groupHeading}>Statement</h2>
          <div className={styles.summary}>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Period</span>
              <span>
                {statement.periodStart} – {statement.periodEnd}
              </span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Start balance</span>
              <span>{formatKc(statement.startingBalanceHalere)}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>End balance</span>
              <span>{formatKc(statement.endingBalanceHalere)}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>To import</span>
              <span>
                {items.length} new
                {duplicateCount > 0 ? `, ${duplicateCount} already imported` : ''}
              </span>
            </div>
            {unclassifiedCount > 0 && (
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>Need a category</span>
                <span>{unclassifiedCount}</span>
              </div>
            )}
          </div>
        </div>

        {items.length === 0 ? (
          <p className={styles.muted}>
            Every transaction in this statement is already imported — nothing new to add.
          </p>
        ) : (
          <>
            {orderedGroups.length > 0 && (
              <div className={styles.group}>
                <h2 className={styles.groupHeading}>Needs a category</h2>
                <ul className={styles.list}>{orderedGroups.map(renderGroup)}</ul>
              </div>
            )}
            {classifiedRows.length > 0 && (
              <div className={styles.group}>
                <h2 className={styles.groupHeading}>
                  Classified automatically ({classifiedRows.length})
                </h2>
                <ul className={styles.list}>{classifiedRows.map(renderClassifiedRow)}</ul>
              </div>
            )}
          </>
        )}

        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primary}
            onClick={() => void handleCommit()}
            disabled={busy || saving || items.length === 0}
          >
            {busy || saving ? 'Saving…' : `Import ${items.length}`}
          </button>
          <button type="button" className={styles.secondary} onClick={reset} disabled={busy}>
            Back
          </button>
        </div>
      </section>
    );
  }

  if (step === 'done' && result) {
    return (
      <section className={styles.screen}>
        <h1 className={styles.heading}>Import complete</h1>
        <div className={styles.group}>
          <h2 className={styles.groupHeading}>Summary</h2>
          <div className={styles.summary}>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Imported</span>
              <span>{result.imported} transactions</span>
            </div>
            {result.duplicates > 0 && (
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>Skipped (already had)</span>
                <span>{result.duplicates}</span>
              </div>
            )}
            {result.rulesCreated > 0 && (
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>New rules learned</span>
                <span>{result.rulesCreated}</span>
              </div>
            )}
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Months updated</span>
              <span>{result.monthsTouched.join(', ')}</span>
            </div>
          </div>
        </div>
        <p className={styles.muted}>Saved from {fileName}.</p>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={() => navigate('/month')}>
            View month
          </button>
          <button type="button" className={styles.secondary} onClick={reset}>
            Import another
          </button>
        </div>
      </section>
    );
  }

  return null;
}
