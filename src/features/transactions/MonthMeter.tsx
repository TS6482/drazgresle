import { memo, useMemo, type ReactNode } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { TooltipContentProps } from 'recharts';
import type { Category } from '../../types/data';
import { savingsRate, type MonthSummary } from '../../engine/summarize';
import { spendingByArea } from '../../engine/areas';
import { formatKc } from '../../engine/money';
import { formatPercent } from '../../engine/percent';
import styles from './MonthMeter.module.css';

interface MonthMeterProps {
  summary: MonthSummary;
  categories: Category[];
  /** Month <select>, rendered under the leftover figure inside the arch (and,
   *  on a no-income month, as the sole control so the user isn't stranded). */
  monthPicker?: ReactNode;
}

/** Each area's colour var — theme-aware, defined (light + dark) in tokens.css. */
const AREA_VAR: Record<string, string> = {
  essential: '--area-essential',
  food: '--area-food',
  entertainment: '--area-entertainment',
  kids: '--area-kids',
  others: '--area-others',
};

function areaVar(areaId: string): string {
  return AREA_VAR[areaId] ?? '--area-others';
}

/** Sentinel key for the unfilled remainder slice of the arc. */
const REMAINDER_KEY = '__remainder';

/** Sentinel key + neutral colour var for the "Saved" arc segment. */
const SAVED_KEY = '__saved';
const SAVED_VAR = '--area-saved';

/** One arc slice as fed to Recharts (a spending area, "Saved", or the remainder). */
interface Slice {
  key: string;
  name: string;
  value: number;
  colorVar: string | null;
}

/**
 * Floating readout for the hovered/tapped segment: the amount leads (strong ink),
 * the segment name and its share of income follow. The empty remainder track
 * shows nothing.
 */
function GaugeTooltip({ active, payload, income }: TooltipContentProps & { income: number }) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const slice = payload[0]?.payload as Slice | undefined;
  if (!slice || slice.key === REMAINDER_KEY) {
    return null;
  }
  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipHead}>
        <span
          className={styles.tooltipKey}
          style={{ background: slice.colorVar ? `var(${slice.colorVar})` : 'transparent' }}
          aria-hidden="true"
        />
        <span className={styles.tooltipName}>{slice.name}</span>
      </div>
      <div className={styles.tooltipValue}>{formatKc(slice.value)}</div>
      <div className={styles.tooltipPct}>
        {formatPercent((slice.value / income) * 100, { decimals: 0 })} of income
      </div>
    </div>
  );
}

/**
 * An arched "barometer" (half-donut gauge): the whole arc represents the month's
 * INCOME, filled left-to-right with a coloured segment per spending area (in
 * SPENDING_AREAS order), then a neutral "Saved" segment for money put away; the
 * rest of the arc is the empty track. Only the true amount left (income − spent −
 * saved) sits under the arch, red when negative. Hovering or tapping a segment
 * shows its amount and share of income in a floating tooltip; a muted savings-rate
 * line sits beneath.
 *
 * Edge cases: no income → a muted line; allocation (spend + saved) exceeding
 * income → segments fill the whole arc (reads as full) and the leftover figure
 * shows negative (red). A withdrawal month (saved < 0) simply shows no Saved
 * segment; the leftover figure still reflects true leftover.
 */
export const MonthMeter = memo(function MonthMeter({
  summary,
  categories,
  monthPicker,
}: MonthMeterProps) {
  const byId = useMemo(
    () => new Map<string, Category>(categories.map((c) => [c.id, c])),
    [categories],
  );
  const areas = useMemo(
    () => spendingByArea(summary.byCategory, byId),
    [summary.byCategory, byId],
  );

  const income = summary.incomeHalere;
  const spent = summary.spendHalere;
  const saved = summary.savedHalere;
  const leftover = summary.leftoverHalere;

  if (income <= 0) {
    // No arch to render — but the month picker must still be reachable, or an
    // empty month strands the user with no way to navigate away.
    return (
      <div className={styles.meter}>
        {monthPicker && <div className={styles.emptyPicker}>{monthPicker}</div>}
        <p className={styles.note}>
          No income recorded this month, so there&apos;s nothing to measure against.
        </p>
      </div>
    );
  }

  // Drawn segments: spending areas with real spend (fixed area order), then a
  // neutral "Saved" segment when money was put away this month.
  const drawn = areas.filter((a) => a.spendHalere > 0);
  const savedShown = saved > 0;

  // The arc spans everything allocated (spend + money saved) up to income; a
  // remainder slice fills any slack and vanishes when allocation exceeds income
  // (the arc then reads as full).
  const totalAllocated = spent + Math.max(0, saved);
  const overAllocated = totalAllocated > income;
  const remainder = overAllocated ? 0 : Math.max(0, income - totalAllocated);

  // Half-donut slices: the coloured segments plus the empty remainder track.
  const data: Slice[] = [
    ...drawn.map((a) => ({
      key: a.areaId,
      name: a.name,
      value: a.spendHalere,
      colorVar: areaVar(a.areaId),
    })),
    ...(savedShown ? [{ key: SAVED_KEY, name: 'Saved', value: saved, colorVar: SAVED_VAR }] : []),
    ...(remainder > 0
      ? [{ key: REMAINDER_KEY, name: '', value: remainder, colorVar: null }]
      : []),
  ];

  // Always non-null here — income > 0 past the early return above.
  const rate = savingsRate(summary);

  return (
    <div className={styles.meter}>
      <div className={styles.gauge}>
        <ResponsiveContainer width="100%" height={170}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="key"
              cx="50%"
              cy="100%"
              startAngle={180}
              endAngle={0}
              innerRadius={104}
              outerRadius={150}
              stroke="var(--color-surface)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {data.map((slice) => (
                <Cell
                  key={slice.key}
                  fill={slice.colorVar ? `var(${slice.colorVar})` : 'var(--color-surface-alt)'}
                />
              ))}
            </Pie>
            <Tooltip content={(props) => <GaugeTooltip {...props} income={income} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className={styles.center}>
          <span className={`${styles.leftValue} ${leftover < 0 ? styles.negative : ''}`}>
            {formatKc(leftover)}
          </span>
          {monthPicker}
        </div>
      </div>

      {rate !== null && (
        <p className={styles.savingsRate}>
          Savings rate: {formatPercent(rate, { decimals: 0 })} of income
        </p>
      )}
    </div>
  );
});
