import { useMemo, useState } from 'react';
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

/**
 * A horizontal "barometer": the bar's full width is the month's INCOME, filled
 * left-to-right with a coloured segment per spending area (in SPENDING_AREAS
 * order). The unfilled remainder is what's left. A prominent "Left" figure sits
 * above it (income − spent), red when negative. Hovering/tapping a segment (or
 * its legend entry) shows that area's amount and share of income beside the bar.
 *
 * Edge cases: no income → a muted line (nothing to measure against); overspent →
 * the segments scale to fill the whole bar (reads as 100% full), "Left" shows
 * negative, and an "Over by" note appears. A segment never overflows the bar.
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
  // Overspending fills the whole bar: divide by total spend so segments sum to
  // 100%. Otherwise divide by income so the fill is the share actually spent.
  const denom = overspent ? spent : income;
  // The empty track at the end — none when overspent (bar is full).
  const remainder = overspent ? 0 : Math.max(0, income - spent);

  const active = drawn.find((a) => a.areaId === activeId) ?? null;

  return (
    <div className={styles.meter}>
      <div className={styles.leftBox}>
        <span className={styles.leftLabel}>Left</span>
        <span className={`${styles.leftValue} ${leftover < 0 ? styles.negative : ''}`}>
          {formatKc(leftover)}
        </span>
      </div>

      <div className={styles.track}>
        {drawn.map((a) => (
          <button
            key={a.areaId}
            type="button"
            className={styles.segment}
            style={{ flexGrow: a.spendHalere / denom, background: `var(${areaVar(a.areaId)})` }}
            aria-label={`${a.name}: ${formatKc(a.spendHalere)}, ${formatPercent(
              (a.spendHalere / income) * 100,
            )} of income`}
            onMouseEnter={() => setActiveId(a.areaId)}
            onMouseLeave={() => setActiveId(null)}
            onFocus={() => setActiveId(a.areaId)}
            onBlur={() => setActiveId(null)}
            onClick={() => setActiveId(a.areaId)}
          />
        ))}
        {remainder > 0 && (
          <div
            className={styles.remainder}
            style={{ flexGrow: remainder / denom }}
            aria-hidden="true"
          />
        )}
      </div>

      {overspent && (
        <p className={styles.overNote}>Over by {formatKc(spent - income)}</p>
      )}

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
