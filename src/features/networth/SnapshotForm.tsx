import { useEffect, useMemo, useRef, useState } from 'react';
import type { Account, Snapshot } from '../../types/data';
import { formatKc, parseKcInput } from '../../engine/money';
import { mortgageBalanceAt } from '../../engine/loan';
import { computeNetWorth } from '../../engine/networth';
import { latestStatementMeta, useDataStore } from '../../store/data';
import { shiftMonth, todayIso } from '../../utils/dates';
import { monthKey } from '../../engine/summarize';
import { MoneyInput, isMoneyValid } from '../shared/MoneyInput';
import forms from '../shared/forms.module.css';
import styles from './NetWorth.module.css';

interface SnapshotFormProps {
  /** The snapshot being edited, or undefined for a new one. */
  snapshot?: Snapshot;
  accounts: Account[];
  snapshots: Snapshot[];
  onDone: () => void;
}

function moneyToInput(halere: number): string {
  return formatKc(halere, { suffix: false });
}

interface Prefill {
  raw: string;
  hint?: string;
}

export function SnapshotForm({ snapshot, accounts, snapshots, onDone }: SnapshotFormProps) {
  const saveSnapshot = useDataStore((s) => s.saveSnapshot);
  const deleteSnapshot = useDataStore((s) => s.deleteSnapshot);
  const saving = useDataStore((s) => s.saving);
  const monthStatements = useDataStore((s) => s.monthStatements);
  const loadMonth = useDataStore((s) => s.loadMonth);

  const activeAccounts = useMemo(() => accounts.filter((a) => a.active), [accounts]);
  const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : undefined;

  // For Air Bank statement-driven balances we need recent month files (their
  // statement metadata may live a month or two back). Pull the last few in.
  useEffect(() => {
    const start = monthKey(todayIso());
    for (let i = 0; i < 4; i++) {
      void loadMonth(shiftMonth(start, -i));
    }
  }, [loadMonth]);

  // The most recent imported statement, whose ending balance seeds any
  // statement-driven account (new snapshots only).
  const latestStatement = useMemo(() => latestStatementMeta(monthStatements), [monthStatements]);

  function isStatementDriven(account: Account): boolean {
    return account.statementSource === 'airbank';
  }

  // Prefill is intentionally computed once, when the form mounts — a lazy
  // useState initializer, so later store updates never overwrite what the
  // user is typing.
  const [prefill] = useState(() => {
    const today = todayIso();
    const map = new Map<string, Prefill>();
    for (const account of activeAccounts) {
      if (snapshot) {
        const v = snapshot.balances[account.id];
        map.set(account.id, { raw: v !== undefined ? moneyToInput(v) : '' });
        continue;
      }
      if (account.type === 'mortgage' && account.loan) {
        map.set(account.id, {
          raw: moneyToInput(mortgageBalanceAt(account.loan, today)),
          hint: 'computed from the loan model — edit if the bank differs',
        });
        continue;
      }
      const prev = latest?.balances[account.id];
      if (prev !== undefined) {
        map.set(account.id, { raw: moneyToInput(prev) });
        continue;
      }
      if (account.type === 'family-loan' && account.familyLoan) {
        map.set(account.id, { raw: moneyToInput(account.familyLoan.outstandingHalere) });
        continue;
      }
      map.set(account.id, { raw: '' });
    }
    return map;
  });

  const [date, setDate] = useState(snapshot?.date ?? todayIso());
  const [note, setNote] = useState(snapshot?.note ?? '');
  const [balances, setBalances] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const account of activeAccounts) {
      initial[account.id] = prefill.get(account.id)?.raw ?? '';
    }
    return initial;
  });

  // Accounts whose balance the user has typed into — statement prefill never
  // overwrites those (respects the "don't clobber typing" rule).
  const touched = useRef<Set<string>>(new Set());

  function updateBalance(accountId: string, value: string) {
    touched.current.add(accountId);
    setBalances((prev) => ({ ...prev, [accountId]: value }));
  }

  // On a NEW snapshot, seed statement-driven accounts from the latest imported
  // statement's ending balance, once that metadata has loaded — but only while
  // the user hasn't edited the field.
  useEffect(() => {
    if (snapshot || latestStatement === null) {
      return;
    }
    const raw = moneyToInput(latestStatement.endingBalanceHalere);
    setBalances((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const account of activeAccounts) {
        if (isStatementDriven(account) && !touched.current.has(account.id) && next[account.id] !== raw) {
          next[account.id] = raw;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [snapshot, latestStatement, activeAccounts]);

  const allValid = activeAccounts.every((a) => isMoneyValid(balances[a.id] ?? '', true));
  const canSave = date !== '' && allValid;

  // Live net-worth preview from the entered values.
  const previewNet = useMemo(() => {
    const parsed: Record<string, number> = {};
    for (const account of activeAccounts) {
      const raw = balances[account.id] ?? '';
      if (raw.trim() !== '') {
        const v = parseKcInput(raw);
        if (v !== null) {
          parsed[account.id] = v;
        }
      }
    }
    return computeNetWorth(accounts, { date, balances: parsed }).netHalere;
  }, [accounts, activeAccounts, balances, date]);

  async function handleSubmit() {
    if (!canSave) {
      return;
    }
    // Preserve balances of accounts not shown (e.g. deactivated ones in history).
    const nextBalances: Record<string, number> = { ...(snapshot?.balances ?? {}) };
    for (const account of activeAccounts) {
      const raw = balances[account.id] ?? '';
      if (raw.trim() === '') {
        delete nextBalances[account.id];
      } else {
        const v = parseKcInput(raw);
        if (v !== null) {
          nextBalances[account.id] = v;
        }
      }
    }

    const next: Snapshot = { date, balances: nextBalances };
    if (note.trim() !== '') {
      next.note = note.trim();
    }

    const ok = await saveSnapshot(next);
    if (ok) {
      onDone();
    }
  }

  async function handleDelete() {
    if (!snapshot) {
      return;
    }
    if (!window.confirm(`Delete the snapshot from ${snapshot.date}?`)) {
      return;
    }
    const ok = await deleteSnapshot(snapshot.date);
    if (ok) {
      onDone();
    }
  }

  return (
    <section className={styles.formScreen}>
      <h1 className={styles.heading}>{snapshot ? 'Edit snapshot' : 'New snapshot'}</h1>

      <div className={forms.field}>
        <label className={forms.label} htmlFor="snap-date">
          Date
        </label>
        <input
          id="snap-date"
          className={forms.input}
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {activeAccounts.length === 0 && (
        <p className={styles.muted}>
          Add some accounts first — then their balances appear here to fill in.
        </p>
      )}

      {activeAccounts.map((account) => {
        const statementHint =
          !snapshot && isStatementDriven(account) && latestStatement !== null
            ? `from statement ${latestStatement.periodEnd} — edit if it differs`
            : undefined;
        return (
          <MoneyInput
            key={account.id}
            id={`bal-${account.id}`}
            label={account.name}
            value={balances[account.id] ?? ''}
            onChange={(v) => updateBalance(account.id, v)}
            hint={statementHint ?? prefill.get(account.id)?.hint}
            allowEmpty
          />
        );
      })}

      <div className={forms.field}>
        <label className={forms.label} htmlFor="snap-note">
          Note (optional)
        </label>
        <input
          id="snap-note"
          className={forms.input}
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <div className={styles.previewBar}>
        <span className={styles.previewLabel}>Net worth</span>
        <span className={styles.previewValue}>{formatKc(previewNet)}</span>
      </div>

      <div className={forms.actions}>
        <button
          type="button"
          className={forms.primary}
          onClick={() => void handleSubmit()}
          disabled={!canSave || saving}
        >
          {saving ? 'Saving…' : 'Save snapshot'}
        </button>
        <button type="button" className={forms.secondary} onClick={onDone}>
          Cancel
        </button>
      </div>

      {snapshot && (
        <div className={forms.actions}>
          <button
            type="button"
            className={forms.danger}
            onClick={() => void handleDelete()}
            disabled={saving}
          >
            Delete snapshot
          </button>
        </div>
      )}
    </section>
  );
}
