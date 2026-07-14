import { useMemo } from 'react';
import { computeNetWorth } from '../../engine/networth';
import { formatKc } from '../../engine/money';
import { useDataStore } from '../../store/data';
import { navigate } from '../../router/useHashRoute';
import { daysBetween, todayIso } from '../../utils/dates';
import styles from './Home.module.css';

/** Quarterly cadence: nudge once the last snapshot is older than this. */
const SNAPSHOT_STALE_DAYS = 92;

export function Home() {
  const accounts = useDataStore((s) => s.accounts);
  const snapshots = useDataStore((s) => s.snapshots);
  const loading = useDataStore((s) => s.loading);

  const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : undefined;

  const net = useMemo(
    () => (latest ? computeNetWorth(accounts, latest).netHalere : null),
    [accounts, latest],
  );

  const daysSinceLast = latest ? daysBetween(latest.date, todayIso()) : null;
  const needsSnapshot = daysSinceLast === null || daysSinceLast > SNAPSHOT_STALE_DAYS;

  return (
    <section className={styles.home}>
      <div className={styles.netCard}>
        <span className={styles.netLabel}>Net worth</span>
        {net === null ? (
          <span className={styles.netEmpty}>
            {loading ? 'Loading…' : 'No snapshots yet'}
          </span>
        ) : (
          <>
            <span className={styles.netValue}>{formatKc(net)}</span>
            <span className={styles.netMeta}>
              as of {latest?.date}
              {daysSinceLast !== null && ` · ${daysSinceLast} days ago`}
            </span>
          </>
        )}
      </div>

      {needsSnapshot && !loading && (
        <button
          type="button"
          className={styles.nudge}
          onClick={() => navigate('/networth')}
        >
          <span className={styles.nudgeTitle}>Time for a quarterly snapshot</span>
          <span className={styles.nudgeText}>
            {latest
              ? `It has been ${daysSinceLast} days since your last one. Tap to record where things stand today.`
              : 'Record your first snapshot to start tracking net worth over time.'}
          </span>
        </button>
      )}

      <div className={styles.links}>
        <button type="button" className={styles.linkCard} onClick={() => navigate('/networth')}>
          Net worth trend
        </button>
        <button type="button" className={styles.linkCard} onClick={() => navigate('/accounts')}>
          Accounts
        </button>
      </div>
    </section>
  );
}
