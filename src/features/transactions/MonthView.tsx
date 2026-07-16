import { useEffect, useMemo, useState } from 'react';
import type { Category, Rule, RuleField, Transaction } from '../../types/data';
import { isExpenseGroup, isSavingsGroup, summarizeMonth } from '../../engine/summarize';
import {
  classify,
  displayVendor,
  planRuleUpdate,
  ruleMatchFor,
  suggestRuleForStored,
} from '../../engine/classify';
import { formatKc } from '../../engine/money';
import { cashFlowForYear } from '../../engine/cashflow';
import { SPENDING_AREAS, areaColor, areaIcon, areaOf } from '../../engine/areas';
import { resolveCategoryIcon } from '../../engine/categoryIcons';
import { CategoryIcon } from '../shared/icons/CategoryIcon';
import { MonthMeter } from './MonthMeter';
import { CashFlowChart } from './CashFlowChart';
import { GoalReadout } from '../shared/GoalReadout';
import { useDataStore } from '../../store/data';
import { navigate } from '../../router/useHashRoute';
import { formatDayMonth, formatMonthLabel, shiftMonth } from '../../utils/dates';
import { newId } from '../../utils/id';
import { CategoryPicker } from '../shared/CategoryPicker';
import styles from './MonthView.module.css';

/** A staged category change awaiting confirmation, with its rule offer. */
interface PendingChange {
  txId: string;
  categoryId: string;
  addRule: boolean;
  pattern: string;
  field: RuleField | null;
  suggestedPattern: string;
}

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
  const defaultMonthKey = useDataStore((s) => s.defaultMonthKey);
  const goalTarget = useDataStore((s) => s.goals.monthlyLeftoverHalere);
  const loadMonth = useDataStore((s) => s.loadMonth);
  const saveTransaction = useDataStore((s) => s.saveTransaction);
  const saveTransactions = useDataStore((s) => s.saveTransactions);
  const deleteTransaction = useDataStore((s) => s.deleteTransaction);
  const saveRules = useDataStore((s) => s.saveRules);
  const rules = useDataStore((s) => s.rules);
  const saving = useDataStore((s) => s.saving);

  const [viewedMonth, setViewedMonth] = useState(defaultMonthKey);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [autoResult, setAutoResult] = useState<string | null>(null);
  // A category change staged in the inline editor, with its rule offer.
  const [pending, setPending] = useState<PendingChange | null>(null);
  // The personal-note input open in the inline editor, if any.
  const [noteDraft, setNoteDraft] = useState<{ txId: string; value: string } | null>(null);
  // Category drill-downs open in budget-vs-actual (several may be open at once).
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});
  // Spending-area accordions in the spending list — collapsed by default.
  const [openAreas, setOpenAreas] = useState<Record<string, boolean>>({});
  // The full transaction list is collapsed by default; unclassified stay pinned.
  const [showAll, setShowAll] = useState(false);

  // Months January..viewed of the viewed year — for the cash-flow chart.
  const yearMonths = useMemo(() => {
    const year = viewedMonth.slice(0, 4);
    const upTo = Number(viewedMonth.slice(5, 7));
    const list: string[] = [];
    for (let m = 1; m <= upTo; m++) {
      list.push(`${year}-${String(m).padStart(2, '0')}`);
    }
    return list;
  }, [viewedMonth]);

  useEffect(() => {
    // Loading the viewed month plus every earlier month this year; the store
    // dedupes already-loaded months, so this is cheap after the first pass.
    for (const mk of yearMonths) {
      void loadMonth(mk);
    }
  }, [yearMonths, loadMonth]);

  /** Change months, dropping the previous month's transient view state. */
  function goToMonth(delta: number) {
    setAutoResult(null);
    setOpenCategories({});
    setOpenAreas({});
    setShowAll(false);
    setPending(null);
    setNoteDraft(null);
    setViewedMonth((m) => shiftMonth(m, delta));
  }

  function toggleCategory(categoryId: string) {
    setOpenCategories((prev) => ({ ...prev, [categoryId]: !(prev[categoryId] ?? false) }));
  }

  function toggleArea(areaId: string) {
    setOpenAreas((prev) => ({ ...prev, [areaId]: !(prev[areaId] ?? false) }));
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

  const cashFlow = useMemo(
    () => cashFlowForYear(months, categories, budgets, viewedMonth),
    [months, categories, budgets, viewedMonth],
  );

  // Newest first for the transaction list.
  const ordered = useMemo(
    () => [...transactions].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    [transactions],
  );

  const unclassified = ordered.filter((t) => t.categoryId === null);

  // Budget-vs-actual splits into spending (ceiling budgets) and saving (target
  // floors). Income rows never appear — they are already the Income total. The
  // engine still returns every row in byCategory (filtering is display-only).
  const spendingRows = summary.byCategory.filter((row) => isExpenseGroup(row.group));
  const savingRows = summary.byCategory.filter((row) => isSavingsGroup(row.group));

  // Group the spending rows under their spending areas (SPENDING_AREAS order),
  // keeping only areas that have at least one expense category with spend or a
  // budget. Each area header carries the subtotal spend and, when any category
  // in it is budgeted, the summed area budget with the same over/under treatment
  // as a category row.
  const areaGroups = SPENDING_AREAS.map((area) => {
    const rows = spendingRows.filter((row) => {
      const category = byId.get(row.categoryId);
      return (category ? areaOf(category) : 'others') === area.id;
    });
    const spend = rows.reduce((sum, row) => sum + row.spendHalere, 0);
    const budgetedRows = rows.filter((row) => row.budgetHalere !== null);
    const hasBudget = budgetedRows.length > 0;
    const budget = budgetedRows.reduce((sum, row) => sum + (row.budgetHalere ?? 0), 0);
    return { area, rows, spend, hasBudget, budget, over: hasBudget && spend > budget };
  }).filter((group) => group.rows.length > 0);

  function categoryName(categoryId: string | null): string {
    if (categoryId === null) {
      return 'Uncategorized';
    }
    return byId.get(categoryId)?.name ?? categoryId;
  }

  /** The resolved icon tile for a category id (fallback for a missing one). */
  function iconFor(categoryId: string): { iconId: string; colorId: string } {
    const category = byId.get(categoryId);
    return category ? resolveCategoryIcon(category) : { iconId: 'tag', colorId: 'gray' };
  }

  async function setCategory(tx: Transaction, categoryId: string | null) {
    await saveTransaction({ ...tx, categoryId });
  }

  /**
   * The inline editor's category pick. Bank rows changing to a real category
   * STAGE the change with a rule offer (correction = learning, ARCHITECTURE.md
   * §6); cash/manual rows and un-categorizing save immediately as before —
   * there is no vendor to learn from those.
   */
  function pickCategory(tx: Transaction, categoryId: string | null) {
    const learnable = tx.source !== 'cash' && tx.source !== 'manual';
    if (!learnable || categoryId === null || categoryId === tx.categoryId) {
      setPending(null);
      void setCategory(tx, categoryId);
      return;
    }
    const s = suggestRuleForStored(tx, categoryId);
    setPending({
      txId: tx.id,
      categoryId,
      addRule: s !== null,
      pattern: s?.pattern ?? '',
      field: s?.field ?? null,
      suggestedPattern: s?.pattern ?? '',
    });
  }

  /** Confirm a staged change: save the transaction, then the rule (if kept). */
  async function confirmPending(tx: Transaction) {
    if (!pending || pending.txId !== tx.id) {
      return;
    }
    const ok = await saveTransaction({ ...tx, categoryId: pending.categoryId });
    if (!ok) {
      return;
    }
    const wantRule = pending.addRule && pending.field !== null && pending.pattern.trim() !== '';
    if (wantRule && pending.field !== null) {
      const target: Rule = {
        id: newId('rule'),
        field: pending.field,
        match: ruleMatchFor(pending.field, pending.pattern, pending.suggestedPattern),
        pattern: pending.pattern.trim(),
        categoryId: pending.categoryId,
        createdFrom: displayVendor(tx),
      };
      // planRuleUpdate retargets/outranks any older rule that classified this
      // row wrongly; saveRules prepends new rules so the correction wins.
      const savedRule = await saveRules(planRuleUpdate(rules, tx, target));
      if (savedRule) {
        // No auto-reclassification here — surface the explicit button instead.
        const remaining = unclassified.filter((t) => t.id !== tx.id).length;
        setAutoResult(
          remaining > 0
            ? `Rule saved — ${remaining} unclassified row${remaining === 1 ? '' : 's'} can be auto-classified.`
            : 'Rule saved — future imports will use it.',
        );
      }
    }
    setPending(null);
    setEditingId(null);
  }

  async function remove(tx: Transaction) {
    const ok = await deleteTransaction(viewedMonth, tx.id);
    if (ok) {
      setEditingId(null);
      setPending(null);
      setNoteDraft(null);
    }
  }

  /** Save the note draft; blank text removes the note entirely. */
  async function saveNote(tx: Transaction) {
    if (!noteDraft || noteDraft.txId !== tx.id) {
      return;
    }
    const value = noteDraft.value.trim();
    const next: Transaction = { ...tx };
    if (value === '') {
      delete next.note;
    } else {
      next.note = value;
    }
    const ok = await saveTransaction(next);
    if (ok) {
      setNoteDraft(null);
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

  /** Primary row line: the VENDOR for bank rows (merchant for card payments —
   *  the counterparty is just the cardholder); cash/manual entries keep their
   *  typed note/counterparty as before (new cash entries store it in `note`). */
  function primaryLine(tx: Transaction): string {
    if (tx.source === 'cash' || tx.source === 'manual') {
      return tx.counterparty || tx.description || tx.note || categoryName(tx.categoryId);
    }
    return displayVendor(tx);
  }

  function renderRow(tx: Transaction) {
    const editing = editingId === tx.id;
    const income = tx.amountHalere > 0;
    const primary = primaryLine(tx);
    // Secondary context: show the full description unless it IS the primary.
    const secondary = tx.description.trim() !== primary ? tx.description.trim() : '';
    const staged = pending && pending.txId === tx.id ? pending : null;
    return (
      <li key={tx.id} className={styles.txItem}>
        <button
          type="button"
          className={styles.txRow}
          onClick={() => {
            setPending(null);
            setNoteDraft(null);
            setEditingId(editing ? null : tx.id);
          }}
          aria-expanded={editing}
        >
          <span className={styles.txMain}>
            <span className={styles.txWho}>{primary}</span>
            <span className={styles.txMeta}>
              <span className={styles.txDate}>{formatDayMonth(tx.date)}</span>
              <span
                className={`${styles.chip} ${tx.categoryId === null ? styles.chipNone : ''}`}
              >
                {categoryName(tx.categoryId)}
              </span>
              {secondary && <span className={styles.txDesc}>{secondary}</span>}
            </span>
            {tx.note && tx.note !== primary && (
              <span className={styles.txNote}>✎ {tx.note}</span>
            )}
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
              value={staged ? staged.categoryId : tx.categoryId}
              onChange={(categoryId) => pickCategory(tx, categoryId)}
              categories={categories}
              includeNone
            />

            {staged && (
              <>
                {staged.field !== null && (
                  <div className={styles.ruleBox}>
                    <label className={styles.ruleRow} htmlFor={`rule-${tx.id}`}>
                      <input
                        id={`rule-${tx.id}`}
                        type="checkbox"
                        checked={staged.addRule}
                        onChange={(e) =>
                          setPending((p) => (p ? { ...p, addRule: e.target.checked } : p))
                        }
                      />
                      <span>
                        Always classify <strong>{displayVendor(tx)}</strong> as{' '}
                        <strong>{categoryName(staged.categoryId)}</strong>
                      </span>
                    </label>
                    {staged.addRule && (
                      <div className={styles.patternRow}>
                        <label className={styles.editorLabel} htmlFor={`rule-pat-${tx.id}`}>
                          matching text
                        </label>
                        <input
                          id={`rule-pat-${tx.id}`}
                          className={styles.patternInput}
                          type="text"
                          autoComplete="off"
                          value={staged.pattern}
                          onChange={(e) =>
                            setPending((p) => (p ? { ...p, pattern: e.target.value } : p))
                          }
                          aria-invalid={staged.pattern.trim() === ''}
                        />
                        <span
                          className={
                            staged.pattern.trim() === '' ? styles.patternError : styles.patternHint
                          }
                          role={staged.pattern.trim() === '' ? 'alert' : undefined}
                        >
                          {staged.pattern.trim() === ''
                            ? 'Enter the text to match — the rule is skipped while this is empty.'
                            : 'Shorten it to match more (e.g. just the shop name).'}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                <div className={styles.editorActions}>
                  <button
                    type="button"
                    className={styles.confirmBtn}
                    onClick={() => void confirmPending(tx)}
                    disabled={saving}
                  >
                    {saving ? 'Saving…' : 'Save change'}
                  </button>
                  <button
                    type="button"
                    className={styles.cancelBtn}
                    onClick={() => setPending(null)}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}

            {!staged && (
              <>
                {noteDraft && noteDraft.txId === tx.id ? (
                  <div className={styles.patternRow}>
                    <label className={styles.editorLabel} htmlFor={`note-${tx.id}`}>
                      Note (yours, not the bank&apos;s)
                    </label>
                    <input
                      id={`note-${tx.id}`}
                      className={styles.patternInput}
                      type="text"
                      autoComplete="off"
                      value={noteDraft.value}
                      onChange={(e) => setNoteDraft({ txId: tx.id, value: e.target.value })}
                      placeholder="e.g. ask about this"
                    />
                    <div className={styles.editorActions}>
                      <button
                        type="button"
                        className={styles.confirmBtn}
                        onClick={() => void saveNote(tx)}
                        disabled={saving}
                      >
                        {saving ? 'Saving…' : tx.note && noteDraft.value.trim() === '' ? 'Remove note' : 'Save note'}
                      </button>
                      <button
                        type="button"
                        className={styles.cancelBtn}
                        onClick={() => setNoteDraft(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={styles.noteBtn}
                    onClick={() => setNoteDraft({ txId: tx.id, value: tx.note ?? '' })}
                  >
                    {tx.note ? '✎ Edit note' : '✎ Add note'}
                  </button>
                )}
                <button
                  type="button"
                  className={styles.deleteBtn}
                  onClick={() => void remove(tx)}
                  disabled={saving}
                >
                  Delete transaction
                </button>
              </>
            )}
          </div>
        )}
      </li>
    );
  }

  /**
   * One budget-vs-actual accordion row. Spending rows keep ceiling semantics
   * (red "Over by" when exceeded); saving rows are targets to HIT — reaching
   * or beating one is shown positively, never as a problem.
   */
  function renderBudgetRow(row: (typeof summary.byCategory)[number], savings: boolean) {
    const hasBudget = row.budgetHalere !== null;
    const over = row.overBudget;
    const met = savings && row.targetMet === true;
    const fraction = hasBudget ? progressFraction(row.spendHalere, row.budgetHalere ?? 0) : 0;
    const open = openCategories[row.categoryId] ?? false;
    const icon = iconFor(row.categoryId);
    // Same objects as the full list — an edit here reflects there.
    const categoryTxs = ordered.filter((t) => t.categoryId === row.categoryId);
    return (
      <li key={row.categoryId} className={styles.budgetRow}>
        <button
          type="button"
          className={styles.budgetHeader}
          onClick={() => toggleCategory(row.categoryId)}
          aria-expanded={open}
        >
          <CategoryIcon iconId={icon.iconId} color={icon.colorId} size={26} />
          <span className={styles.rowContent}>
            <span className={styles.budgetName}>{categoryName(row.categoryId)}</span>
            <span className={styles.rowRight}>
              <span className={styles.budgetFigures}>
                {formatKc(row.spendHalere)}
                {hasBudget && (
                  <span className={styles.budgetOf}> / {formatKc(row.budgetHalere ?? 0)}</span>
                )}
                <span
                  className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
                  aria-hidden="true"
                >
                  ›
                </span>
              </span>
              {hasBudget && (
                <span className={styles.track}>
                  <span
                    className={`${styles.fill} ${!savings && over ? styles.fillOver : ''}`}
                    style={{ width: `${fraction * 100}%` }}
                  />
                </span>
              )}
              {!savings && over && (
                <span className={styles.overText}>
                  Over by {formatKc(row.spendHalere - (row.budgetHalere ?? 0))}
                </span>
              )}
              {met && <span className={styles.metText}>✓ target reached</span>}
            </span>
          </span>
        </button>
        {open &&
          (categoryTxs.length > 0 ? (
            <ul className={`${styles.txList} ${styles.drillList}`}>{categoryTxs.map(renderRow)}</ul>
          ) : (
            <p className={styles.muted}>No transactions in this category yet.</p>
          ))}
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

      <CashFlowChart series={cashFlow} />

      <MonthMeter summary={summary} categories={categories} />

      {goalTarget !== undefined && summary.incomeHalere > 0 && (
        <GoalReadout leftoverHalere={summary.leftoverHalere} targetHalere={goalTarget} />
      )}

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

      {(spendingRows.length > 0 || savingRows.length > 0) && (
        <div className={styles.block}>
          <h2 className={styles.blockHeading}>Budget vs actual</h2>
          {spendingRows.length > 0 && (
            <>
              <h3 className={styles.subHeading}>Spending</h3>
              <ul className={styles.areaList}>
                {areaGroups.map((group) => {
                  const open = openAreas[group.area.id] ?? false;
                  const fraction = group.hasBudget
                    ? progressFraction(group.spend, group.budget)
                    : 0;
                  return (
                    <li key={group.area.id} className={styles.areaGroup}>
                      <button
                        type="button"
                        className={styles.areaHeader}
                        onClick={() => toggleArea(group.area.id)}
                        aria-expanded={open}
                      >
                        <CategoryIcon
                          iconId={areaIcon(group.area.id)}
                          color={areaColor(group.area.id)}
                          size={28}
                        />
                        <span className={styles.rowContent}>
                          <span className={styles.areaName}>{group.area.name}</span>
                          <span className={styles.rowRight}>
                            <span className={styles.budgetFigures}>
                              {formatKc(group.spend)}
                              {group.hasBudget && (
                                <span className={styles.budgetOf}> / {formatKc(group.budget)}</span>
                              )}
                              <span
                                className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
                                aria-hidden="true"
                              >
                                ›
                              </span>
                            </span>
                            {group.hasBudget && (
                              <span className={styles.track}>
                                <span
                                  className={`${styles.fill} ${group.over ? styles.fillOver : ''}`}
                                  style={{ width: `${fraction * 100}%` }}
                                />
                              </span>
                            )}
                            {group.over && (
                              <span className={styles.overText}>
                                Over by {formatKc(group.spend - group.budget)}
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                      {open && (
                        <ul className={`${styles.budgetList} ${styles.areaCategories}`}>
                          {group.rows.map((row) => renderBudgetRow(row, false))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {savingRows.length > 0 && (
            <>
              <h3 className={styles.subHeading}>Saving</h3>
              <ul className={styles.budgetList}>
                {savingRows.map((row) => renderBudgetRow(row, true))}
              </ul>
            </>
          )}
        </div>
      )}

      {ordered.length > 0 && (
        <div className={styles.block}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
          >
            {showAll ? 'Hide transactions' : `Show all ${ordered.length} transactions`}
          </button>
          {showAll && (
            <>
              <h2 className={styles.blockHeading}>All transactions</h2>
              <ul className={styles.txList}>{ordered.map(renderRow)}</ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
