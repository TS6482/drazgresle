import { lazy, Suspense, useEffect, useMemo } from 'react';
import type { Category } from '../../types/data';
import { computeNetWorth } from '../../engine/networth';
import { cashFlowForYear } from '../../engine/cashflow';
import { isExpenseGroup, savingsRate, summarizeMonth } from '../../engine/summarize';
import { displayVendor } from '../../engine/classify';
import { formatKc } from '../../engine/money';
import { formatPercent } from '../../engine/percent';
import { GoalReadout } from '../shared/GoalReadout';
import { useDataStore } from '../../store/data';
import { useMenuStore } from '../../store/menu';
import { navigate } from '../../router/useHashRoute';
import { daysBetween, formatDayMonth, formatMonthLabel, todayIso } from '../../utils/dates';
import styles from './Home.module.css';

// Recharts is heavy; load the cash-flow chart on demand so it stays out of the
// entry chunk (see docs/ARCHITECTURE.md — bundle split). Named memoized export,
// re-mapped to the default lazy() expects.
const CashFlowChart = lazy(() =>
  import('../transactions/CashFlowChart').then((m) => ({ default: m.CashFlowChart })),
);

/** Quarterly cadence: nudge once the last snapshot is older than this. */
const SNAPSHOT_STALE_DAYS = 92;

export function Home() {
  const accounts = useDataStore((s) => s.accounts);
  const snapshots = useDataStore((s) => s.snapshots);
  const categories = useDataStore((s) => s.categories);
  const budgets = useDataStore((s) => s.budgets);
  const months = useDataStore((s) => s.months);
  const defaultMonthKey = useDataStore((s) => s.defaultMonthKey);
  const goalTarget = useDataStore((s) => s.goals.monthlyLeftoverHalere);
  const loading = useDataStore((s) => s.loading);
  const loadMonth = useDataStore((s) => s.loadMonth);

  const transactions = useMemo(
    () => months[defaultMonthKey] ?? [],
    [months, defaultMonthKey],
  );

  // Months January..default of the default month's year — the cash-flow chart's
  // series. Load each (the store dedupes already-loaded months) so it has data.
  const yearMonths = useMemo(() => {
    const year = defaultMonthKey.slice(0, 4);
    const upTo = Number(defaultMonthKey.slice(5, 7));
    const list: string[] = [];
    for (let m = 1; m <= upTo; m++) {
      list.push(`${year}-${String(m).padStart(2, '0')}`);
    }
    return list;
  }, [defaultMonthKey]);

  useEffect(() => {
    for (const mk of yearMonths) {
      void loadMonth(mk);
    }
  }, [yearMonths, loadMonth]);

  // Contribute the screen's quick actions to the floating ⋯ menu.
  const setActions = useMenuStore((s) => s.setActions);
  const clearActions = useMenuStore((s) => s.clearActions);
  useEffect(() => {
    setActions([
      { id: 'import', label: 'Import statement', run: () => navigate('/import') },
      { id: 'add-cash', label: 'Add cash expense', run: () => navigate('/add') },
    ]);
    return () => clearActions();
  }, [setActions, clearActions]);

  const cashFlow = useMemo(
    () => cashFlowForYear(months, categories, budgets, defaultMonthKey),
    [months, categories, budgets, defaultMonthKey],
  );

  const byId = useMemo(
    () => new Map<string, Category>(categories.map((c) => [c.id, c])),
    [categories],
  );

  const summary = useMemo(
    () => summarizeMonth(transactions, categories, budgets, defaultMonthKey),
    [transactions, categories, budgets, defaultMonthKey],
  );

  // SPENDING budgets only — savings targets are floors to hit, not part of the
  // spending ceiling this card tracks. byCategory includes every budgeted
  // category (even with no activity), so this sum is complete.
  const totalBudget = useMemo(() => {
    let total = 0;
    let any = false;
    for (const row of summary.byCategory) {
      if (isExpenseGroup(row.group) && row.budgetHalere !== null) {
        total += row.budgetHalere;
        any = true;
      }
    }
    return any ? total : null;
  }, [summary]);

  // Expense groups only: an income category must never appear in "top
  // spending", even in a month with no spending at all.
  const topCategories = summary.byCategory
    .filter((c) => isExpenseGroup(c.group) && c.spendHalere > 0)
    .slice(0, 3);

  const recent = useMemo(
    () =>
      [...transactions]
        .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
        .slice(0, 5),
    [transactions],
  );

  const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : undefined;
  const net = useMemo(
    () => (latest ? computeNetWorth(accounts, latest).netHalere : null),
    [accounts, latest],
  );
  const daysSinceLast = latest ? daysBetween(latest.date, todayIso()) : null;
  const needsSnapshot = daysSinceLast === null || daysSinceLast > SNAPSHOT_STALE_DAYS;

  function categoryName(categoryId: string | null): string {
    if (categoryId === null) {
      return 'Uncategorized';
    }
    return byId.get(categoryId)?.name ?? categoryId;
  }

  /** Recent rows lead with the vendor (merchant for card rows); cash/manual
   *  entries keep their typed note/counterparty (new cash entries store it in
   *  `note`). */
  function recentLine(tx: (typeof recent)[number]): string {
    if (tx.source === 'cash' || tx.source === 'manual') {
      return tx.counterparty || tx.description || tx.note || categoryName(tx.categoryId);
    }
    return displayVendor(tx);
  }

  const budgetFraction =
    totalBudget && totalBudget > 0 ? Math.min(1, summary.spendHalere / totalBudget) : 0;
  const overBudget = totalBudget !== null && summary.spendHalere > totalBudget;

  // Non-null only when the month has income — then the Saved line carries the
  // share of income put away, otherwise it stays a plain amount.
  const savedRate = savingsRate(summary);

  return (
    <section className={styles.home}>
      <h1 className={styles.heading}>Dražgrešle</h1>

      <div className={styles.card}>
        <div className={styles.cardTop}>
          <span className={styles.cardLabel}>{formatMonthLabel(defaultMonthKey)}</span>
          <button type="button" className={styles.link} onClick={() => navigate('/month')}>
            Details ›
          </button>
        </div>

        {totalBudget === null ? (
          <>
            <span className={styles.spentValue}>{formatKc(summary.spendHalere)}</span>
            <span className={styles.cardMeta}>spent so far · no budgets yet</span>
            <button type="button" className={styles.link} onClick={() => navigate('/budgets')}>
              Set budgets ›
            </button>
          </>
        ) : (
          <>
            <span className={styles.spentValue}>
              {formatKc(summary.spendHalere)}
              <span className={styles.spentOf}> / {formatKc(totalBudget)}</span>
            </span>
            <div className={styles.track}>
              <div
                className={`${styles.fill} ${overBudget ? styles.fillOver : ''}`}
                style={{ width: `${budgetFraction * 100}%` }}
              />
            </div>
            <span className={`${styles.cardMeta} ${overBudget ? styles.overText : ''}`}>
              {overBudget
                ? `Over budget by ${formatKc(summary.spendHalere - totalBudget)}`
                : `${formatKc(totalBudget - summary.spendHalere)} left this month`}
            </span>
          </>
        )}
        {summary.savedHalere !== 0 && (
          <span className={styles.cardMeta}>
            Saved {formatKc(summary.savedHalere)}
            {savedRate !== null && ` · ${formatPercent(savedRate, { decimals: 0 })} of income`}
          </span>
        )}
      </div>

      <Suspense fallback={<div className={styles.cashFlowPlaceholder} />}>
        <CashFlowChart series={cashFlow} />
      </Suspense>

      {goalTarget !== undefined && summary.incomeHalere > 0 && (
        <GoalReadout leftoverHalere={summary.leftoverHalere} targetHalere={goalTarget} />
      )}

      {topCategories.length > 0 && (
        <div className={styles.block}>
          <span className={styles.blockHeading}>Top spending</span>
          <ul className={styles.miniList}>
            {topCategories.map((c) => (
              <li key={c.categoryId} className={styles.miniRow}>
                <span>{categoryName(c.categoryId)}</span>
                <span className={styles.miniAmount}>{formatKc(c.spendHalere)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.unclassifiedCount > 0 && (
        <button type="button" className={styles.callout} onClick={() => navigate('/month')}>
          <span className={styles.calloutTitle}>
            {summary.unclassifiedCount} transaction
            {summary.unclassifiedCount === 1 ? '' : 's'} need a category
          </span>
          <span className={styles.calloutText}>Tap to review this month.</span>
        </button>
      )}

      {recent.length > 0 && (
        <div className={styles.block}>
          <span className={styles.blockHeading}>Recent</span>
          <ul className={styles.miniList}>
            {recent.map((tx) => (
              <li key={tx.id} className={styles.miniRow}>
                <span className={styles.recentWho}>{recentLine(tx)}</span>
                <span className={styles.miniRight}>
                  <span className={styles.recentDate}>{formatDayMonth(tx.date)}</span>
                  <span
                    className={`${styles.miniAmount} ${tx.amountHalere > 0 ? styles.income : ''}`}
                  >
                    {formatKc(tx.amountHalere)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!loading && transactions.length === 0 && (
        <p className={styles.muted}>
          No spending recorded this month yet. Add a cash expense to get started.
        </p>
      )}

      <button type="button" className={styles.netLine} onClick={() => navigate('/networth')}>
        <span className={styles.netLabel}>Net worth</span>
        <span className={styles.netValue}>
          {net === null ? (loading ? 'Loading…' : 'No snapshots yet') : formatKc(net)}
        </span>
      </button>

      {needsSnapshot && !loading && (
        <button type="button" className={styles.nudge} onClick={() => navigate('/networth')}>
          <span className={styles.nudgeTitle}>Time for a quarterly snapshot</span>
          <span className={styles.nudgeText}>
            {latest
              ? `It has been ${daysSinceLast} days since your last one. Tap to record where things stand today.`
              : 'Record your first snapshot to start tracking net worth over time.'}
          </span>
        </button>
      )}
    </section>
  );
}
