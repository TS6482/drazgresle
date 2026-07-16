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

/** Sentinel key + neutral colour var for the "Saved" arc segment. */
const SAVED_KEY = '__saved';
const SAVED_VAR = '--area-saved';

/** A selectable arc segment: a spending area, or the neutral "Saved" slice. */
interface Segment {
  key: string;
  name: string;
  valueHalere: number;
  colorVar: string;
}

/**
 * An arched "barometer" (half-donut gauge): the whole arc represents the month's
 * INCOME, filled left-to-right with a coloured segment per spending area (in
 * SPENDING_AREAS order), then a neutral "Saved" segment for money put away; the
 * remaining arc is the empty track. The true amount left (income − spent −
 * saved) sits under the arch, red when negative. Hovering/tapping a segment (or
 * its legend entry) shows that segment's amount and share of income.
 *
 * Edge cases: no income → a muted line; allocation (spend + saved) exceeding
 * income → segments fill the whole arc (reads as full), "Left" shows negative,
 * and an "Over by" note appears. A withdrawal month (saved < 0) simply shows no
 * Saved segment; "Left" still reflects true leftover.
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
  const saved = summary.savedHalere;
  const leftover = summary.leftoverHalere;

  if (income <= 0) {
    return (
      <p className={styles.note}>
        No income recorded this month, so there&apos;s nothing to measure against.
      </p>
    );
  }

  // Selectable segments: spending areas with real spend (fixed area order),
  // then a neutral "Saved" segment when money was put away this month.
  const drawn = areas.filter((a) => a.spendHalere > 0);
  const savedShown = saved > 0;
  const segments: Segment[] = [
    ...drawn.map((a) => ({
      key: a.areaId,
      name: a.name,
      valueHalere: a.spendHalere,
      colorVar: areaVar(a.areaId),
    })),
    ...(savedShown
      ? [{ key: SAVED_KEY, name: 'Saved', valueHalere: saved, colorVar: SAVED_VAR }]
      : []),
  ];

  // The arc spans everything allocated (spend + money saved) up to income; a
  // remainder slice fills any slack and vanishes when allocation exceeds income
  // (the arc then reads as full).
  const totalAllocated = spent + Math.max(0, saved);
  const overAllocated = totalAllocated > income;
  const remainder = overAllocated ? 0 : Math.max(0, income - totalAllocated);

  // Half-donut slices: the segments plus the empty remainder as a track slice.
  // Recharts sums the values, so the arc spans the allocation (capped at income
  // by the remainder, or the total allocation when over) across the semicircle.
  const data = [
    ...segments.map((s) => ({ key: s.key, value: s.valueHalere, colorVar: s.colorVar })),
    ...(remainder > 0 ? [{ key: REMAINDER_KEY, value: remainder, colorVar: null }] : []),
  ];

  const active = segments.find((s) => s.key === activeId) ?? null;

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
                  fill={slice.colorVar ? `var(${slice.colorVar})` : 'var(--color-surface-alt)'}
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

      {leftover < 0 && <p className={styles.overNote}>Over by {formatKc(-leftover)}</p>}

      <div className={styles.detail}>
        {active ? (
          <>
            <span
              className={styles.detailSwatch}
              style={{ background: `var(${active.colorVar})` }}
              aria-hidden="true"
            />
            <span className={styles.detailName}>{active.name}</span>
            <span className={styles.detailValue}>{formatKc(active.valueHalere)}</span>
            <span className={styles.detailPct}>
              {formatPercent((active.valueHalere / income) * 100)} of income
            </span>
          </>
        ) : (
          <span className={styles.detailHint}>Tap an area to see its amount and share.</span>
        )}
      </div>

      {segments.length > 0 && (
        <ul className={styles.legend}>
          {segments.map((s) => {
            const on = s.key === activeId;
            return (
              <li key={s.key}>
                <button
                  type="button"
                  className={`${styles.legendItem} ${on ? styles.legendItemOn : ''}`}
                  onMouseEnter={() => setActiveId(s.key)}
                  onMouseLeave={() => setActiveId(null)}
                  onFocus={() => setActiveId(s.key)}
                  onBlur={() => setActiveId(null)}
                  onClick={() => setActiveId(on ? null : s.key)}
                  aria-pressed={on}
                >
                  <span
                    className={styles.legendSwatch}
                    style={{ background: `var(${s.colorVar})` }}
                    aria-hidden="true"
                  />
                  {s.name}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
