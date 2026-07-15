import { useMemo, useState } from 'react';
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
 * share of income, with the income total in the centre. Hovering or tapping a
 * slice shows its amount and share in the panel beside the ring (not a tooltip
 * over the chart). Months a pie can't honestly show (no income, overspending, a
 * savings withdrawal) render a plain one-line explanation instead.
 */
export function MonthDonut({ summary }: MonthDonutProps) {
  const allocation = useMemo(() => incomeAllocation(summary), [summary]);
  // Which slice's detail is shown beside the ring. Keyed by slice (not index)
  // so it stays correct across month changes without a reset effect.
  const [activeKey, setActiveKey] = useState<AllocationKey | null>(null);

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

  // Non-zero slices draw the ring; a zero slice is omitted from the ring but can
  // still be shown in the detail panel (at 0 %).
  const drawn = allocation.slices.filter((s) => s.halere > 0);
  const active = allocation.slices.find((s) => s.key === activeKey) ?? null;

  return (
    <div className={styles.donut}>
      <div className={styles.ringWrap}>
        <ResponsiveContainer width="100%" height={170}>
          <PieChart>
            <Pie
              data={drawn}
              dataKey="halere"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={76}
              startAngle={90}
              endAngle={-270}
              stroke="var(--color-surface)"
              strokeWidth={2}
              isAnimationActive={false}
              onMouseEnter={(_, index) => setActiveKey(drawn[index]?.key ?? null)}
              onMouseLeave={() => setActiveKey(null)}
              onClick={(_, index) => setActiveKey(drawn[index]?.key ?? null)}
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

      <div className={styles.detail}>
        {active ? (
          <>
            <span className={styles.detailHead}>
              <span
                className={styles.detailSwatch}
                style={{ background: `var(${SLICE_VAR[active.key]})` }}
                aria-hidden="true"
              />
              {active.label}
            </span>
            <span className={styles.detailValue}>{formatKc(active.halere)}</span>
            <span className={styles.detailPct}>{formatPercent(active.pct)} of income</span>
          </>
        ) : (
          <span className={styles.detailHint}>Tap a slice to see its amount and share.</span>
        )}
      </div>
    </div>
  );
}
