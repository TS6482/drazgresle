import { useMemo, useState } from 'react';
import { computeNetWorth, computeSeries } from '../../engine/networth';
import { formatKc } from '../../engine/money';
import { useDataStore } from '../../store/data';
import { NetWorthChart } from './NetWorthChart';
import { SnapshotForm } from './SnapshotForm';
import styles from './NetWorth.module.css';

type Mode = { kind: 'list' } | { kind: 'new' } | { kind: 'edit'; date: string };

export function NetWorth() {
  const accounts = useDataStore((s) => s.accounts);
  const snapshots = useDataStore((s) => s.snapshots);
  const loading = useDataStore((s) => s.loading);

  const [mode, setMode] = useState<Mode>({ kind: 'list' });

  const series = useMemo(() => computeSeries(accounts, snapshots), [accounts, snapshots]);

  // Newest first for the history list.
  const history = useMemo(
    () =>
      [...snapshots]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((s) => ({ date: s.date, net: computeNetWorth(accounts, s).netHalere, note: s.note })),
    [accounts, snapshots],
  );

  if (mode.kind === 'new') {
    return (
      <SnapshotForm
        accounts={accounts}
        snapshots={snapshots}
        onDone={() => setMode({ kind: 'list' })}
      />
    );
  }

  if (mode.kind === 'edit') {
    const target = snapshots.find((s) => s.date === mode.date);
    return (
      <SnapshotForm
        snapshot={target}
        accounts={accounts}
        snapshots={snapshots}
        onDone={() => setMode({ kind: 'list' })}
      />
    );
  }

  return (
    <section className={styles.screen}>
      <div className={styles.topBar}>
        <h1 className={styles.heading}>Net worth</h1>
        <button type="button" className={styles.addButton} onClick={() => setMode({ kind: 'new' })}>
          + Snapshot
        </button>
      </div>

      {loading && snapshots.length === 0 && <p className={styles.muted}>Loading…</p>}

      {series.length === 0 && !loading && (
        <p className={styles.muted}>
          No snapshots yet. Add your first quarterly snapshot to start the chart.
        </p>
      )}

      {series.length > 0 && (
        <NetWorthChart series={series} />
      )}

      {series.length === 1 && (
        <p className={styles.muted}>Add another snapshot next quarter to see the trend.</p>
      )}

      {history.length > 0 && (
        <div className={styles.group}>
          <h2 className={styles.groupHeading}>History</h2>
          <p className={styles.muted}>Tap a snapshot to edit it.</p>
          <ul className={styles.list}>
            {history.map((item) => (
              <li key={item.date}>
                <button
                  type="button"
                  className={styles.historyRow}
                  onClick={() => setMode({ kind: 'edit', date: item.date })}
                >
                  <span className={styles.historyText}>
                    <span className={styles.historyDate}>{item.date}</span>
                    {item.note && <span className={styles.historyNote}>{item.note}</span>}
                  </span>
                  <span className={styles.historyNet}>{formatKc(item.net)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
