import { useEffect, useMemo, useState } from 'react';
import type { Category, Transaction } from '../../types/data';
import { isExpenseGroup, summarizeMonth } from '../../engine/summarize';
import { classify } from '../../engine/classify';
import { formatKc } from '../../engine/money';
import { useDataStore } from '../../store/data';
import { navigate } from '../../router/useHashRoute';
import { formatDayMonth, formatMonthLabel, shiftMonth } from '../../utils/dates';
import { CategoryPicker } from '../shared/CategoryPicker';
import styles from './MonthView.module.css';

/** Fraction 0–1 of a budget spent, clamped for the progress bar width. */
function progressFraction(spent: number, budget: number): number {
  if (budget <= 0) {
    return spent > 0 ? 1 : 0;
  }
  return Math.max(0, Math.min(1, spent / budget));
}

export function MonthView() {
  const categories = useDataStore((s) => s.categories);
  const budgets = useDataStore((s) => s.budgets);
  const months = useDataStore((s) => s.months);
  const monthsLoaded = useDataStore((s) => s.monthsLoaded);
  const currentMonthKey = useDataStore((s) => s.currentMonthKey);
  const loadMonth = useDataStore((s) => s.loadMonth);
  const saveTransaction = useDataStore((s) => s.saveTransaction);
  const saveTransactions = useDataStore((s) => s.saveTransactions);
  const deleteTransaction = useDataStore((s) => s.deleteTransaction);
  const rules = useDataStore((s) => s.rules);
  const saving = useDataStore((s) => s.saving);

  const [viewedMonth, setViewedMonth] = useState(currentMonthKey);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [autoResult, setAutoResult] = useState<string | null>(null);

  useEffect(() => {
    void loadMonth(viewedMonth);
  }, [viewedMonth, loadMonth]);

  /** Change months and drop the previous month's auto-classify message. */
  function goToMonth(delta: number) {
    setAutoResult(null);
    setViewedMonth((m) => shiftMonth(m, delta));
  }

  const transactions = useMemo(() => months[viewedMonth] ?? [], [months, viewedMonth]);
  const loaded = monthsLoaded[viewedMonth] ?? false;

  const byId = useMemo(
    () => new Map<string, Category>(categories.map((c) => [c.id, c])),
    [categories],
  );

  const summary = useMemo(
    () => summarizeMonth(transactions, categories, budgets, viewedMonth),
    [transactions, categories, budgets, viewedMonth],
  );

  // Newest first for the transaction list.
  const ordered = useMemo(
    () => [...transactions].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    [transactions],
  );

  const unclassified = ordered.filter((t) => t.categoryId === null);

  // Budget-vs-actual is an EXPENSE view: income categories are already counted
  // in the Income total above, so their rows are presentation noise here. The
  // engine still returns them in byCategory (filtering is display-only).
  const budgetRows = summary.byCategory.filter((row) => isExpenseGroup(row.group));

  function categoryName(categoryId: string | null): string {
    if (categoryId === null) {
      return 'Uncategorized';
    }
    return byId.get(categoryId)?.name ?? categoryId;
  }

  async function setCategory(tx: Transaction, categoryId: string | null) {
    await saveTransaction({ ...tx, categoryId });
  }

  async function remove(tx: Transaction) {
    const ok = await deleteTransaction(viewedMonth, tx.id);
    if (ok) {
      setEditingId(null);
    }
  }

  /** Retroactive re-apply: run the CURRENT rules over this month's unclassified
   *  transactions and save every new match in one write (explicit, never
   *  automatic — see docs/ARCHITECTURE.md §6). */
  async function autoClassify() {
    const updated: Transaction[] = [];
    for (const tx of unclassified) {
      const categoryId = classify(tx, rules);
      if (categoryId !== null) {
        updated.push({ ...tx, categoryId });
      }
    }
    if (updated.length === 0) {
      setAutoResult('No rule matched — classify one by hand to teach a new rule.');
      return;
    }
    const ok = await saveTransactions(viewedMonth, updated);
    if (ok) {
      setAutoResult(
        `Classified ${updated.length} of ${unclassified.length} using your rules.`,
      );
    }
  }

  function renderRow(tx: Transaction) {
    const editing = editingId === tx.id;
    const income = tx.amountHalere > 0;
    return (
      <li key={tx.id} className={styles.txItem}>
        <button
          type="button"
          className={styles.txRow}
          onClick={() => setEditingId(editing ? null : tx.id)}
          aria-expanded={editing}
        >
          <span className={styles.txMain}>
            <span className={styles.txWho}>
              {tx.counterparty || tx.description || categoryName(tx.categoryId)}
            </span>
            <span className={styles.txMeta}>
              <span className={styles.txDate}>{formatDayMonth(tx.date)}</span>
              <span
                className={`${styles.chip} ${tx.categoryId === null ? styles.chipNone : ''}`}
              >
                {categoryName(tx.categoryId)}
              </span>
            </span>
          </span>
          <span className={`${styles.txAmount} ${income ? styles.income : ''}`}>
            {formatKc(tx.amountHalere)}
          </span>
        </button>

        {editing && (
          <div className={styles.editor}>
            <label className={styles.editorLabel} htmlFor={`cat-${tx.id}`}>
              Category
            </label>
            <CategoryPicker
              id={`cat-${tx.id}`}
              value={tx.categoryId}
              onChange={(categoryId) => void setCategory(tx, categoryId)}
              categories={categories}
              includeNone
            />
            <button
              type="button"
              className={styles.deleteBtn}
              onClick={() => void remove(tx)}
              disabled={saving}
            >
              Delete transaction
            </button>
          </div>
        )}
      </li>
    );
  }

  return (
    <section className={styles.screen}>
      <div className={styles.monthNav}>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => goToMonth(-1)}
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className={styles.monthLabel}>{formatMonthLabel(viewedMonth)}</span>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => goToMonth(1)}
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className={styles.summary}>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Income</span>
          <span className={`${styles.summaryValue} ${styles.income}`}>
            {formatKc(summary.incomeHalere)}
          </span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Spent</span>
          <span className={styles.summaryValue}>{formatKc(summary.spendHalere)}</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Net</span>
          <span className={styles.summaryValue}>{formatKc(summary.netHalere)}</span>
        </div>
      </div>

      <div className={styles.actionsRow}>
        <button type="button" className={styles.secondaryBtn} onClick={() => navigate('/import')}>
          Import statement
        </button>
        <button type="button" className={styles.primaryBtn} onClick={() => navigate('/add')}>
          + Add cash
        </button>
      </div>

      <div className={styles.actionsRow}>
        <button type="button" className={styles.secondaryBtn} onClick={() => navigate('/budgets')}>
          Edit budgets
        </button>
      </div>

      {!loaded && transactions.length === 0 && <p className={styles.muted}>Loading…</p>}

      {loaded && transactions.length === 0 && (
        <p className={styles.muted}>
          No transactions this month yet. Add a cash expense, or import statements when that
          arrives.
        </p>
      )}

      {unclassified.length > 0 && (
        <div className={styles.block}>
          <h2 className={styles.blockHeading}>
            Needs a category ({unclassified.length})
          </h2>
          {rules.length > 0 && (
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => void autoClassify()}
              disabled={saving}
            >
              {saving ? 'Working…' : `Auto-classify ${unclassified.length} unclassified`}
            </button>
          )}
          {autoResult && <p className={styles.muted}>{autoResult}</p>}
          <ul className={styles.txList}>{unclassified.map(renderRow)}</ul>
        </div>
      )}

      {unclassified.length === 0 && autoResult && (
        <p className={styles.muted}>{autoResult}</p>
      )}

      {budgetRows.length > 0 && (
        <div className={styles.block}>
          <h2 className={styles.blockHeading}>Budget vs actual</h2>
          <ul className={styles.budgetList}>
            {budgetRows.map((row) => {
              const hasBudget = row.budgetHalere !== null;
              const over = row.overBudget;
              const fraction = hasBudget ? progressFraction(row.spendHalere, row.budgetHalere ?? 0) : 0;
              return (
                <li key={row.categoryId} className={styles.budgetRow}>
                  <div className={styles.budgetTop}>
                    <span className={styles.budgetName}>{categoryName(row.categoryId)}</span>
                    <span className={styles.budgetFigures}>
                      {formatKc(row.spendHalere)}
                      {hasBudget && (
                        <span className={styles.budgetOf}> / {formatKc(row.budgetHalere ?? 0)}</span>
                      )}
                    </span>
                  </div>
                  {hasBudget && (
                    <div className={styles.track}>
                      <div
                        className={`${styles.fill} ${over ? styles.fillOver : ''}`}
                        style={{ width: `${fraction * 100}%` }}
                      />
                    </div>
                  )}
                  {over && (
                    <span className={styles.overText}>
                      Over by {formatKc(row.spendHalere - (row.budgetHalere ?? 0))}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {ordered.length > 0 && (
        <div className={styles.block}>
          <h2 className={styles.blockHeading}>All transactions</h2>
          <ul className={styles.txList}>{ordered.map(renderRow)}</ul>
        </div>
      )}
    </section>
  );
}
