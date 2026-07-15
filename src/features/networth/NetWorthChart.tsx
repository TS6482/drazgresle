import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TooltipContentProps } from 'recharts';
import type { NetWorthSeriesRow } from '../../engine/networth';
import { formatKc } from '../../engine/money';
import { formatShortDate } from '../../utils/dates';
import { ASSET_SERIES, LIABILITY_SERIES } from '../shared/labels';
import styles from './NetWorth.module.css';

interface NetWorthChartProps {
  series: NetWorthSeriesRow[];
}

/** Compact crown value for the Y axis, e.g. 1 234 567 → "1,2M". */
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

/** One tooltip listing net + every series at the hovered snapshot. */
function SnapshotTooltip({
  active,
  label,
  series,
}: TooltipContentProps & { series: NetWorthSeriesRow[] }) {
  if (!active || label === undefined) {
    return null;
  }
  const row = series.find((r) => r.date === String(label));
  if (!row) {
    return null;
  }

  const rows: { key: string; name: string; value: number; cssVar: string }[] = [
    ...ASSET_SERIES.map((s) => ({
      key: s.key,
      name: s.label,
      value: row[s.key],
      cssVar: s.cssVar,
    })),
    {
      key: LIABILITY_SERIES.key,
      name: LIABILITY_SERIES.label,
      value: row.liabilities,
      cssVar: LIABILITY_SERIES.cssVar,
    },
  ].filter((r) => r.value !== 0);

  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipDate}>{row.date}</div>
      <div className={styles.tooltipNet}>{formatKc(row.net)}</div>
      <div className={styles.tooltipSub}>net worth</div>
      <ul className={styles.tooltipList}>
        {rows.map((r) => (
          <li key={r.key} className={styles.tooltipRow}>
            <span className={styles.tooltipValue}>{formatKc(r.value)}</span>
            <span className={styles.tooltipKeyWrap}>
              <span
                className={styles.tooltipStroke}
                style={{ background: `var(${r.cssVar})` }}
                aria-hidden="true"
              />
              <span className={styles.tooltipName}>{r.name}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function NetWorthChart({ series }: NetWorthChartProps) {
  // Liabilities render as their own band below the zero baseline.
  const data = series.map((row) => ({
    date: row.date,
    net: row.net,
    bank: row.bank,
    investments: row.investments,
    pensions: row.pensions,
    property: row.property,
    otherAssets: row.otherAssets,
    liabilities: -row.liabilities,
  }));

  return (
    <div className={styles.chart}>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="date"
            tickFormatter={formatShortDate}
            tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--chart-baseline)' }}
            minTickGap={16}
          />
          <YAxis
            tickFormatter={compactKc}
            tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <ReferenceLine y={0} stroke="var(--chart-baseline)" />

          {ASSET_SERIES.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stackId="assets"
              stroke="var(--chart-surface)"
              strokeWidth={1.5}
              fill={`var(${s.cssVar})`}
              fillOpacity={0.9}
              isAnimationActive={false}
            />
          ))}

          <Area
            type="monotone"
            dataKey="liabilities"
            stroke="var(--chart-surface)"
            strokeWidth={1.5}
            fill={`var(${LIABILITY_SERIES.cssVar})`}
            fillOpacity={0.85}
            isAnimationActive={false}
          />

          <Line
            type="monotone"
            dataKey="net"
            stroke="var(--chart-net)"
            strokeWidth={2}
            dot={{ r: 3, fill: 'var(--chart-net)' }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />

          <Tooltip
            cursor={{ stroke: 'var(--chart-axis)' }}
            content={(props) => <SnapshotTooltip {...props} series={series} />}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <ul className={styles.legend}>
        <li className={styles.legendItem}>
          <span className={styles.legendLine} style={{ background: 'var(--chart-net)' }} />
          Net worth
        </li>
        {ASSET_SERIES.map((s) => (
          <li key={s.key} className={styles.legendItem}>
            <span className={styles.legendSwatch} style={{ background: `var(${s.cssVar})` }} />
            {s.label}
          </li>
        ))}
        <li className={styles.legendItem}>
          <span
            className={styles.legendSwatch}
            style={{ background: `var(${LIABILITY_SERIES.cssVar})` }}
          />
          {LIABILITY_SERIES.label}
        </li>
      </ul>
    </div>
  );
}
