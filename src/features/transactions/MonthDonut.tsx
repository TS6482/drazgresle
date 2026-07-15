import { useMemo } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { TooltipContentProps } from 'recharts';
import type { MonthSummary } from '../../engine/summarize';
import { incomeAllocation } from '../../engine/allocation';
import type { AllocationKey, AllocationSlice } from '../../engine/allocation';
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

/** Per-slice tooltip: name, amount, and share of income. Shows on hover
 *  (desktop) or tap (phone). */
function SliceTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const slice = payload[0].payload as AllocationSlice;
  return (
    <div className={styles.tooltip}>
      <span className={styles.tooltipName}>{slice.label}</span>
      <span className={styles.tooltipValue}>{formatKc(slice.halere)}</span>
      <span className={styles.tooltipPct}>{formatPercent(slice.pct)} of income</span>
    </div>
  );
}

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
            <Tooltip content={(props) => <SliceTooltip {...props} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className={styles.center}>
          <span className={styles.centerValue}>{formatKc(allocation.incomeHalere)}</span>
          <span className={styles.centerLabel}>Income</span>
        </div>
      </div>
      <p className={styles.hint}>Tap a slice for the amount and share.</p>
    </div>
  );
}
