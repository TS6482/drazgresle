import { useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import type { Category } from '../../types/data';
import type { MonthSummary } from '../../engine/summarize';
import { spendingByArea } from '../../engine/areas';
import { formatKc } from '../../engine/money';
import { formatPercent } from '../../engine/percent';
import styles from './MonthMeter.module.css';

interface MonthMeterProps {
  summary: MonthSummary;
  categories: Category[];
}

/** Each area's colour var — theme-aware, defined (light + dark) in the CSS. */
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

/**
 * An arched "barometer" (half-donut gauge): the whole arc represents the month's
 * INCOME, filled left-to-right with a coloured segment per spending area (in
 * SPENDING_AREAS order); the remaining arc is the empty track. The amount left
 * (income − spent) sits under the arch, red when negative. Hovering/tapping a
 * segment (or its legend entry) shows that area's amount and share of income.
 *
 * Edge cases: no income → a muted line; overspent → segments fill the whole arc
 * (reads as full), "Left" shows negative, and an "Over by" note appears.
 */
export function MonthMeter({ summary, categories }: MonthMeterProps) {
  const byId = useMemo(
    () => new Map<string, Category>(categories.map((c) => [c.id, c])),
    [categories],
  );
  const areas = useMemo(
    () => spendingByArea(summary.byCategory, byId),
    [summary.byCategory, byId],
  );
  // Which area's detail is shown. Keyed by area id (not index) so it stays
  // correct across month changes without a reset effect.
  const [activeId, setActiveId] = useState<string | null>(null);

  const income = summary.incomeHalere;
  const spent = summary.spendHalere;
  const leftover = income - spent;

  if (income <= 0) {
    return (
      <p className={styles.note}>
        No income recorded this month, so there&apos;s nothing to measure against.
      </p>
    );
  }

  // Segments to draw (areas with real spend), in fixed area order.
  const drawn = areas.filter((a) => a.spendHalere > 0);
  const overspent = spent > income;
  // When overspent the arc is entirely spending (no empty track); otherwise the
  // remainder fills the rest of the arc up to income.
  const remainder = overspent ? 0 : Math.max(0, income - spent);

  // Half-donut slices: the area segments plus the empty remainder as a track
  // slice. Recharts sums the values, so the arc spans income (or spent when
  // overspent) across the semicircle.
  const data = [
    ...drawn.map((a) => ({ key: a.areaId, value: a.spendHalere })),
    ...(remainder > 0 ? [{ key: REMAINDER_KEY, value: remainder }] : []),
  ];

  const active = drawn.find((a) => a.areaId === activeId) ?? null;

  function selectAt(index: number) {
    const slice = data[index];
    setActiveId(slice && slice.key !== REMAINDER_KEY ? slice.key : null);
  }

  return (
    <div className={styles.meter}>
      <div className={styles.gauge}>
        <ResponsiveContainer width="100%" height={132}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="key"
              cx="50%"
              cy="100%"
              startAngle={180}
              endAngle={0}
              innerRadius={76}
              outerRadius={112}
              stroke="var(--color-surface)"
              strokeWidth={2}
              isAnimationActive={false}
              onMouseEnter={(_, index) => selectAt(index)}
              onMouseLeave={() => setActiveId(null)}
              onClick={(_, index) => selectAt(index)}
            >
              {data.map((slice) => (
                <Cell
                  key={slice.key}
                  fill={
                    slice.key === REMAINDER_KEY
                      ? 'var(--color-surface-alt)'
                      : `var(${areaVar(slice.key)})`
                  }
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className={styles.center}>
          <span className={styles.leftLabel}>Left</span>
          <span className={`${styles.leftValue} ${leftover < 0 ? styles.negative : ''}`}>
            {formatKc(leftover)}
          </span>
        </div>
      </div>

      {overspent && <p className={styles.overNote}>Over by {formatKc(spent - income)}</p>}

      <div className={styles.detail}>
        {active ? (
          <>
            <span
              className={styles.detailSwatch}
              style={{ background: `var(${areaVar(active.areaId)})` }}
              aria-hidden="true"
            />
            <span className={styles.detailName}>{active.name}</span>
            <span className={styles.detailValue}>{formatKc(active.spendHalere)}</span>
            <span className={styles.detailPct}>
              {formatPercent((active.spendHalere / income) * 100)} of income
            </span>
          </>
        ) : (
          <span className={styles.detailHint}>Tap an area to see its amount and share.</span>
        )}
      </div>

      {drawn.length > 0 && (
        <ul className={styles.legend}>
          {drawn.map((a) => {
            const on = a.areaId === activeId;
            return (
              <li key={a.areaId}>
                <button
                  type="button"
                  className={`${styles.legendItem} ${on ? styles.legendItemOn : ''}`}
                  onMouseEnter={() => setActiveId(a.areaId)}
                  onMouseLeave={() => setActiveId(null)}
                  onFocus={() => setActiveId(a.areaId)}
                  onBlur={() => setActiveId(null)}
                  onClick={() => setActiveId(on ? null : a.areaId)}
                  aria-pressed={on}
                >
                  <span
                    className={styles.legendSwatch}
                    style={{ background: `var(${areaVar(a.areaId)})` }}
                    aria-hidden="true"
                  />
                  {a.name}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
