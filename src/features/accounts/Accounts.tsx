import { useMemo, useState } from 'react';
import type { Account } from '../../types/data';
import { classify } from '../../engine/networth';
import { mortgageBalanceAt } from '../../engine/loan';
import { formatKc } from '../../engine/money';
import { useDataStore } from '../../store/data';
import { navigate } from '../../router/useHashRoute';
import { todayIso } from '../../utils/dates';
import { ACCOUNT_TYPE_LABELS, CLASS_LABELS, CLASS_ORDER } from '../shared/labels';
import { AccountForm } from './AccountForm';
import styles from './Accounts.module.css';

/** Latest known balance for an account, or a computed mortgage balance. */
function currentBalance(account: Account, balances: Record<string, number>): number | null {
  const stored = balances[account.id];
  if (stored !== undefined) {
    return stored;
  }
  if (account.type === 'mortgage' && account.loan) {
    return mortgageBalanceAt(account.loan, todayIso());
  }
  return null;
}

export function Accounts() {
  const accounts = useDataStore((s) => s.accounts);
  const snapshots = useDataStore((s) => s.snapshots);
  const loading = useDataStore((s) => s.loading);

  const [editing, setEditing] = useState<Account | null>(null);
  const [creating, setCreating] = useState(false);

  const latestBalances = snapshots.length > 0 ? snapshots[snapshots.length - 1].balances : {};

  const grouped = useMemo(() => {
    const active = accounts.filter((a) => a.active);
    return CLASS_ORDER.map((cls) => ({
      cls,
      items: active.filter((a) => classify(a) === cls),
    })).filter((g) => g.items.length > 0);
  }, [accounts]);

  const inactive = accounts.filter((a) => !a.active);

  if (creating || editing) {
    return (
      <AccountForm
        account={editing ?? undefined}
        onDone={() => {
          setEditing(null);
          setCreating(false);
        }}
      />
    );
  }

  return (
    <section className={styles.screen}>
      <div className={styles.topBar}>
        <h1 className={styles.heading}>Accounts</h1>
        <button type="button" className={styles.addButton} onClick={() => setCreating(true)}>
          + Add
        </button>
      </div>

      {loading && accounts.length === 0 && <p className={styles.muted}>Loading…</p>}

      {!loading && accounts.length === 0 && (
        <p className={styles.muted}>
          No accounts yet. Add your bank accounts, investments, property, and any loans to start
          tracking net worth.
        </p>
      )}

      {!loading && accounts.some((a) => a.active) && snapshots.length === 0 && (
        <button type="button" className={styles.callout} onClick={() => navigate('/networth')}>
          <span className={styles.calloutTitle}>Accounts ready</span>
          <span className={styles.calloutText}>
            Take your first snapshot to record their balances.
          </span>
        </button>
      )}

      {grouped.map((group) => (
        <div key={group.cls} className={styles.group}>
          <h2 className={styles.groupHeading}>{CLASS_LABELS[group.cls]}</h2>
          <ul className={styles.list}>
            {group.items.map((account) => {
              const balance = currentBalance(account, latestBalances);
              return (
                <li key={account.id}>
                  <button
                    type="button"
                    className={styles.accountRow}
                    onClick={() => setEditing(account)}
                  >
                    <span className={styles.accountText}>
                      <span className={styles.accountName}>{account.name}</span>
                      <span className={styles.accountType}>
                        {ACCOUNT_TYPE_LABELS[account.type]}
                      </span>
                    </span>
                    <span className={styles.accountBalance}>
                      {balance === null ? '—' : formatKc(balance)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {inactive.length > 0 && (
        <div className={styles.group}>
          <h2 className={styles.groupHeading}>Inactive</h2>
          <ul className={styles.list}>
            {inactive.map((account) => (
              <li key={account.id}>
                <button
                  type="button"
                  className={`${styles.accountRow} ${styles.inactiveRow}`}
                  onClick={() => setEditing(account)}
                >
                  <span className={styles.accountText}>
                    <span className={styles.accountName}>{account.name}</span>
                    <span className={styles.accountType}>
                      {ACCOUNT_TYPE_LABELS[account.type]}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
