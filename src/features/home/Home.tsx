import { lazy, Suspense, useEffect, useMemo } from 'react';
import { computeNetWorth } from '../../engine/networth';
import { cashFlowForYear } from '../../engine/cashflow';
import { isExpenseGroup, savingsRate, summarizeMonth } from '../../engine/summarize';
import { monthlyAverages } from '../../engine/averages';
import { areaIcon } from '../../engine/areas';
import { formatKc } from '../../engine/money';
import { formatPercent } from '../../engine/percent';
import { CategoryIcon } from '../shared/icons/CategoryIcon';
import { GoalReadout } from '../shared/GoalReadout';
import { useDataStore } from '../../store/data';
import { useMenuStore } from '../../store/menu';
import { navigate } from '../../router/useHashRoute';
import { daysBetween, formatMonthLabel, shiftMonth, todayIso } from '../../utils/dates';
import styles from './Home.module.css';

// Recharts is heavy; load the charts on demand so they stay out of the entry
// chunk (see docs/ARCHITECTURE.md — bundle split). CashFlowChart keeps a named
// memoized export, re-mapped to the default lazy() expects.
const CashFlowChart = lazy(() =>
  import('../transactions/CashFlowChart').then((m) => ({ default: m.CashFlowChart })),
);
const HomeNetWorthChart = lazy(() =>
  import('./HomeNetWorthChart').then((m) => ({ default: m.HomeNetWorthChart })),
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

  // The trailing six months ending at the default month — the "typical month"
  // averages window. Loaded explicitly because `yearMonths` only spans Jan..
  // default of one year, which does not cover six months when the default is
  // early in the year (e.g. February → just Jan, Feb).
  const trailing6 = useMemo(
    () => [0, 1, 2, 3, 4, 5].map((back) => shiftMonth(defaultMonthKey, -back)),
    [defaultMonthKey],
  );

  useEffect(() => {
    for (const mk of new Set([...yearMonths, ...trailing6])) {
      void loadMonth(mk);
    }
  }, [yearMonths, trailing6, loadMonth]);

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

  // Trailing-6-month averages: one row per spending area + income. Empty months
  // in the window are skipped by the engine (divisor excludes them).
  const averages = useMemo(
    () => monthlyAverages(months, categories, budgets, trailing6),
    [months, categories, budgets, trailing6],
  );

  const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : undefined;
  const net = useMemo(
    () => (latest ? computeNetWorth(accounts, latest).netHalere : null),
    [accounts, latest],
  );
  const daysSinceLast = latest ? daysBetween(latest.date, todayIso()) : null;
  const needsSnapshot = daysSinceLast === null || daysSinceLast > SNAPSHOT_STALE_DAYS;

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

      {snapshots.length >= 2 && (
        <Suspense fallback={<div className={styles.netChartPlaceholder} />}>
          <HomeNetWorthChart accounts={accounts} snapshots={snapshots} />
        </Suspense>
      )}

      {averages.monthsUsed > 0 && (
        <div className={styles.block}>
          <span className={styles.blockHeading}>Averages · last 6 months</span>
          <ul className={styles.miniList}>
            {averages.byArea.map((area) => (
              <li key={area.areaId} className={styles.miniRow}>
                <span className={styles.avgWho}>
                  <CategoryIcon
                    iconId={areaIcon(area.areaId)}
                    color={`area-${area.areaId}`}
                    size={28}
                  />
                  {area.name}
                </span>
                <span className={styles.miniAmount}>{formatKc(area.avgHalere)}</span>
              </li>
            ))}
            <li className={styles.miniRow}>
              <span className={styles.avgWho}>Income</span>
              <span className={styles.miniAmount}>{formatKc(averages.avgIncomeHalere)}</span>
            </li>
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

      {!loading && transactions.length === 0 && (
        <p className={styles.muted}>
          No spending recorded this month yet. Add a cash expense to get started.
        </p>
      )}

      {/* The sparkline above already shows Net worth + value when there are ≥2
          snapshots; this compact figure is the fallback for 0–1 snapshots. */}
      {snapshots.length < 2 && (
        <button type="button" className={styles.netLine} onClick={() => navigate('/networth')}>
          <span className={styles.netLabel}>Net worth</span>
          <span className={styles.netValue}>
            {net === null ? (loading ? 'Loading…' : 'No snapshots yet') : formatKc(net)}
          </span>
        </button>
      )}

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
