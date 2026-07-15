import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TooltipContentProps } from 'recharts';
import type { CashFlowPoint } from '../../engine/cashflow';
import { formatKc } from '../../engine/money';
import { formatMonthLabel, formatMonthShort } from '../../utils/dates';
import styles from './CashFlowChart.module.css';

interface CashFlowChartProps {
  series: CashFlowPoint[];
}

/** Compact crown value for the Y axis, e.g. 1 234 567 → "12k". */
function compactKc(halere: number): string {
  const crowns = Math.round(halere / 100);
  const abs = Math.abs(crowns);
  const sign = crowns < 0 ? '-' : '';
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toFixed(1).replace('.', ',')}M`;
  }
  if (abs >= 1_000) {
    return `${sign}${Math.round(abs / 1_000)}k`;
  }
  return `${sign}${abs}`;
}

function CashFlowTooltip({ active, label, series }: TooltipContentProps & { series: CashFlowPoint[] }) {
  if (!active || label === undefined) {
    return null;
  }
  const row = series.find((r) => r.month === String(label));
  if (!row) {
    return null;
  }
  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipMonth}>{formatMonthLabel(row.month)}</div>
      <ul className={styles.tooltipList}>
        <li className={styles.tooltipRow}>
          <span className={styles.swatch} style={{ background: 'var(--flow-income)' }} aria-hidden="true" />
          <span className={styles.tooltipName}>Income</span>
          <span className={styles.tooltipValue}>{formatKc(row.incomeHalere)}</span>
        </li>
        <li className={styles.tooltipRow}>
          <span className={styles.swatch} style={{ background: 'var(--flow-expenses)' }} aria-hidden="true" />
          <span className={styles.tooltipName}>Expenses</span>
          <span className={styles.tooltipValue}>{formatKc(row.expensesHalere)}</span>
        </li>
      </ul>
    </div>
  );
}

/**
 * Monthly cash flow for the year: income vs expenses, one point per month with
 * data. A single month shows as two dots; more months connect into lines. Hover
 * or tap a month to read the exact amounts.
 */
export function CashFlowChart({ series }: CashFlowChartProps) {
  if (series.length === 0) {
    return null;
  }

  return (
    <div className={styles.chart}>
      <div className={styles.title}>Cash flow this year</div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={series} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
          <CartesianGrid vertical={false} stroke="var(--flow-grid)" />
          <XAxis
            dataKey="month"
            tickFormatter={formatMonthShort}
            tick={{ fontSize: 11, fill: 'var(--flow-axis)' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--flow-baseline)' }}
            minTickGap={8}
          />
          <YAxis
            tickFormatter={compactKc}
            tick={{ fontSize: 11, fill: 'var(--flow-axis)' }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Line
            type="monotone"
            dataKey="incomeHalere"
            name="Income"
            stroke="var(--flow-income)"
            strokeWidth={2}
            dot={{ r: 3, fill: 'var(--flow-income)' }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="expensesHalere"
            name="Expenses"
            stroke="var(--flow-expenses)"
            strokeWidth={2}
            dot={{ r: 3, fill: 'var(--flow-expenses)' }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
          <Tooltip
            cursor={{ stroke: 'var(--flow-axis)' }}
            content={(props) => <CashFlowTooltip {...props} series={series} />}
          />
        </LineChart>
      </ResponsiveContainer>

      <ul className={styles.legend}>
        <li className={styles.legendItem}>
          <span className={styles.swatch} style={{ background: 'var(--flow-income)' }} />
          Income
        </li>
        <li className={styles.legendItem}>
          <span className={styles.swatch} style={{ background: 'var(--flow-expenses)' }} />
          Expenses
        </li>
      </ul>
    </div>
  );
}
