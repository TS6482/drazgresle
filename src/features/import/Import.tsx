import { useMemo, useState } from 'react';
import type { Category, Rule, StatementMeta, Transaction } from '../../types/data';
import { extractTextItems, PdfReadError } from '../../api/pdf';
import {
  AirbankParseError,
  parseAirbank,
  type AirbankStatement,
  type ParsedTransaction,
} from '../../engine/parsers/airbank';
import { importHash } from '../../engine/importHash';
import { classify, suggestRule } from '../../engine/classify';
import { formatKc } from '../../engine/money';
import { monthKey } from '../../engine/summarize';
import { useDataStore } from '../../store/data';
import { navigate } from '../../router/useHashRoute';
import { formatDayMonth } from '../../utils/dates';
import { newId } from '../../utils/id';
import { CategoryPicker } from '../shared/CategoryPicker';
import styles from './Import.module.css';

type Step = 'pick' | 'review' | 'done';

/** One reviewable transaction: the draft, its category, and whether to learn a rule. */
interface ReviewItem {
  id: string;
  parsed: ParsedTransaction;
  importHash: string;
  bookingMonth: string;
  categoryId: string | null;
  /** True to save a vendor rule from this classification on commit. */
  addRule: boolean;
}

interface CommitResult {
  imported: number;
  duplicates: number;
  rulesCreated: number;
  monthsTouched: string[];
}

/** Build a review item from a parsed row, auto-classifying via existing rules. */
function toReviewItem(parsed: ParsedTransaction, rules: Rule[]): ReviewItem {
  const hash = importHash({
    date: parsed.date,
    amountHalere: parsed.amountHalere,
    counterparty: parsed.counterparty,
    description: parsed.description,
  });
  return {
    id: newId('imp'),
    parsed,
    importHash: hash,
    bookingMonth: monthKey(parsed.date),
    categoryId: classify(parsed, rules),
    addRule: false,
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

  const unclassifiedCount = items.filter((i) => i.categoryId === null).length;

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

      const all = parsed.transactions.map((p) => toReviewItem(p, rules));
      // Drop rows already present (same statement re-uploaded / overlapping export).
      const fresh: ReviewItem[] = [];
      let dupes = 0;
      const batchSeen = new Set<string>();
      for (const item of all) {
        if (seen.has(item.importHash) || batchSeen.has(item.importHash)) {
          dupes += 1;
          continue;
        }
        batchSeen.add(item.importHash);
        fresh.push(item);
      }

      setStatement(parsed.statement);
      setItems(fresh);
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

  function setCategory(itemId: string, categoryId: string | null) {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) {
          return item;
        }
        // Default the "learn a rule" checkbox on when we can key a rule reliably.
        const canSuggest = categoryId !== null && suggestRule(item.parsed, categoryId) !== null;
        return { ...item, categoryId, addRule: canSuggest };
      }),
    );
  }

  function setAddRule(itemId: string, addRule: boolean) {
    setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, addRule } : item)));
  }

  async function handleCommit() {
    if (statement === null) {
      return;
    }
    setBusy(true);
    setError(null);

    // Collect rules to learn, de-duplicated by field+pattern.
    const ruleByKey = new Map<string, Rule>();
    for (const item of items) {
      if (!item.addRule || item.categoryId === null) {
        continue;
      }
      const rule = suggestRule(item.parsed, item.categoryId);
      if (rule) {
        ruleByKey.set(`${rule.field}|${rule.pattern.toLowerCase()}`, rule);
      }
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
        categoryId: item.categoryId,
        source: 'airbank',
        importHash: item.importHash,
      };
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

  // Unclassified rows pinned on top, then by date (newest first).
  const ordered = useMemo(
    () =>
      [...items].sort((a, b) => {
        const au = a.categoryId === null ? 0 : 1;
        const bu = b.categoryId === null ? 0 : 1;
        if (au !== bu) {
          return au - bu;
        }
        return b.parsed.date.localeCompare(a.parsed.date);
      }),
    [items],
  );

  function renderRow(item: ReviewItem) {
    const p = item.parsed;
    const income = p.amountHalere > 0;
    const suggestion =
      item.categoryId !== null ? suggestRule(p, item.categoryId) : null;
    return (
      <li key={item.id} className={styles.row}>
        <div className={styles.rowTop}>
          <span className={styles.who}>{p.counterparty || p.description || p.type}</span>
          <span className={`${styles.amount} ${income ? styles.income : ''}`}>
            {formatKc(p.amountHalere)}
          </span>
        </div>
        <div className={styles.rowMeta}>
          <span className={styles.date}>{formatDayMonth(p.date)}</span>
          <span className={styles.type}>{p.type}</span>
        </div>
        {p.description && p.counterparty && (
          <span className={styles.desc}>{p.description}</span>
        )}
        <CategoryPicker
          id={`imp-cat-${item.id}`}
          value={item.categoryId}
          onChange={(categoryId) => setCategory(item.id, categoryId)}
          categories={categories}
          includeNone
          noneLabel="Choose a category…"
        />
        {item.categoryId !== null && suggestion && (
          <label className={styles.ruleRow} htmlFor={`imp-rule-${item.id}`}>
            <input
              id={`imp-rule-${item.id}`}
              type="checkbox"
              checked={item.addRule}
              onChange={(e) => setAddRule(item.id, e.target.checked)}
            />
            <span>
              Always classify{' '}
              <strong>{suggestion.field === 'counterpartyAccount' ? p.counterpartyAccount : p.counterparty}</strong>{' '}
              as <strong>{categoryName(item.categoryId)}</strong>
            </span>
          </label>
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

        {items.length === 0 ? (
          <p className={styles.muted}>
            Every transaction in this statement is already imported — nothing new to add.
          </p>
        ) : (
          <ul className={styles.list}>{ordered.map(renderRow)}</ul>
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
