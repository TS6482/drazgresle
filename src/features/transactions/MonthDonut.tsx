import { useMemo } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import type { MonthSummary } from '../../engine/summarize';
import { incomeAllocation } from '../../engine/allocation';
import type { AllocationKey } from '../../engine/allocation';
import { formatKc } from '../../engine/money';
import { formatPercent } from '../../engine/percent';
import styles from './MonthDonut.module.css';

interface MonthDonutProps {
  summary: MonthSummary;
}

/** Each slice's colour var — echoes the net-worth chart's palette so the app
 *  reads as one system (saved = investments aqua, left over = bank blue). */
const SLICE_VAR: Record<AllocationKey, string> = {
  spent: '--slice-spent',
  saved: '--slice-saved',
  leftover: '--slice-leftover',
};

/**
 * A donut of where the month's income went — Spent / Saved / Left over, each a
 * share of income, with the income total in the centre. Months a pie can't
 * honestly show (no income, overspending, a savings withdrawal) render a plain
 * one-line explanation instead.
 */
export function MonthDonut({ summary }: MonthDonutProps) {
  const allocation = useMemo(() => incomeAllocation(summary), [summary]);

  if (allocation.status === 'no-income') {
    return null;
  }

  if (allocation.status === 'overspent') {
    return (
      <p className={styles.note}>
        Spending was more than income this month ({formatPercent(allocation.overspentPct ?? 0)} of
        income).
      </p>
    );
  }

  if (allocation.status === 'withdrawn') {
    return (
      <p className={styles.note}>
        More was taken out of savings than put in this month, so the split isn’t shown.
      </p>
    );
  }

  // Non-zero slices draw; zero slices are omitted from the ring but still listed
  // in the legend at 0 %.
  const drawn = allocation.slices.filter((s) => s.halere > 0);

  return (
    <div className={styles.donut}>
      <div className={styles.ringWrap}>
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie
              data={drawn}
              dataKey="halere"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={54}
              outerRadius={80}
              startAngle={90}
              endAngle={-270}
              stroke="var(--color-surface)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {drawn.map((s) => (
                <Cell key={s.key} fill={`var(${SLICE_VAR[s.key]})`} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className={styles.center}>
          <span className={styles.centerValue}>{formatKc(allocation.incomeHalere)}</span>
          <span className={styles.centerLabel}>Income</span>
        </div>
      </div>

      <ul className={styles.legend}>
        {allocation.slices.map((s) => (
          <li key={s.key} className={styles.legendItem}>
            <span
              className={styles.legendSwatch}
              style={{ background: `var(${SLICE_VAR[s.key]})` }}
              aria-hidden="true"
            />
            <span className={styles.legendName}>{s.label}</span>
            <span className={styles.legendAmount}>{formatKc(s.halere)}</span>
            <span className={styles.legendPct}>{formatPercent(s.pct)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
