import { memo } from 'react';
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import type { Account, Snapshot } from '../../types/data';
import { computeSeries } from '../../engine/networth';
import { formatKc } from '../../engine/money';
import { navigate } from '../../router/useHashRoute';
import styles from './HomeNetWorthChart.module.css';

interface HomeNetWorthChartProps {
  accounts: Account[];
  snapshots: Snapshot[];
}

/**
 * A glanceable net-worth sparkline for Home — the NET line only (no asset bands,
 * no legend, no axes), with a soft area fill. Tapping opens the full Net worth
 * page. Renders nothing with fewer than two snapshots: a line needs two points,
 * and the compact `.netLine` figure already covers the single-snapshot case.
 * Recharts is heavy, so Home lazy-loads this (keeps it out of the entry chunk).
 */
export const HomeNetWorthChart = memo(function HomeNetWorthChart({
  accounts,
  snapshots,
}: HomeNetWorthChartProps) {
  const data = computeSeries(accounts, snapshots).map((row) => ({
    date: row.date,
    net: row.net,
  }));

  if (data.length < 2) {
    return null;
  }

  const latest = data[data.length - 1].net;

  return (
    <button
      type="button"
      className={styles.card}
      onClick={() => navigate('/networth')}
      aria-label="Net worth trend, open Net worth"
    >
      <span className={styles.head}>
        <span className={styles.label}>Net worth</span>
        <span className={styles.value}>{formatKc(latest)}</span>
      </span>
      <span className={styles.plot} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="homeNetFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--home-net-line)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--home-net-line)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            {/* Axes hidden — this is a sparkline. The domain hugs the data so the
                trend's shape reads at a glance rather than being flattened. */}
            <XAxis dataKey="date" hide />
            <YAxis hide domain={['dataMin', 'dataMax']} />
            <Area
              type="monotone"
              dataKey="net"
              stroke="var(--home-net-line)"
              strokeWidth={2}
              fill="url(#homeNetFill)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </span>
    </button>
  );
});
