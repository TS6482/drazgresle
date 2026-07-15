import { useState } from 'react';
import type { Account, AccountOwner, AccountType, FamilyLoan, MortgageLoan } from '../../types/data';
import { parseKcInput } from '../../engine/money';
import { parsePercentInput } from '../../engine/percent';
import { useDataStore } from '../../store/data';
import { todayIso } from '../../utils/dates';
import { ACCOUNT_TYPE_LABELS, ACCOUNT_TYPE_ORDER } from '../shared/labels';
import { MoneyInput, isMoneyValid } from '../shared/MoneyInput';
import forms from '../shared/forms.module.css';
import styles from './Accounts.module.css';

interface AccountFormProps {
  account?: Account;
  onDone: () => void;
}

interface PlanRow {
  year: string;
  amount: string;
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `acc-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function moneyToString(halere: number | undefined): string {
  return halere === undefined ? '' : String(Math.round(halere / 100));
}

function planToRows(plan: Record<string, number> | undefined): PlanRow[] {
  if (!plan) {
    return [{ year: String(new Date().getFullYear()), amount: '' }];
  }
  const rows = Object.entries(plan)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([year, halere]) => ({ year, amount: moneyToString(halere) }));
  return rows.length > 0 ? rows : [{ year: String(new Date().getFullYear()), amount: '' }];
}

export function AccountForm({ account, onDone }: AccountFormProps) {
  const saveAccounts = useDataStore((s) => s.saveAccounts);
  const saving = useDataStore((s) => s.saving);

  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountType>(account?.type ?? 'checking');
  const [owner, setOwner] = useState<AccountOwner>(account?.owner ?? 'joint');

  // Mortgage fields.
  const [principal, setPrincipal] = useState(moneyToString(account?.loan?.principalHalere));
  const [principalAsOf, setPrincipalAsOf] = useState(account?.loan?.principalAsOf ?? todayIso());
  const [annualRatePct, setAnnualRatePct] = useState(
    account?.loan ? String(account.loan.annualRatePct) : '',
  );
  const [monthlyPayment, setMonthlyPayment] = useState(
    moneyToString(account?.loan?.monthlyPaymentHalere),
  );
  const [fixationEnd, setFixationEnd] = useState(account?.loan?.fixationEnd ?? todayIso());

  // Family-loan fields.
  const [outstanding, setOutstanding] = useState(
    moneyToString(account?.familyLoan?.outstandingHalere),
  );
  const [famAsOf, setFamAsOf] = useState(account?.familyLoan?.asOf ?? todayIso());
  const [paymentMonth, setPaymentMonth] = useState(
    account?.familyLoan?.paymentMonth ?? new Date().getMonth() + 1,
  );
  const [planRows, setPlanRows] = useState<PlanRow[]>(planToRows(account?.familyLoan?.plan));

  const rateValid = parsePercentInput(annualRatePct) !== null;

  function updatePlanRow(index: number, patch: Partial<PlanRow>) {
    setPlanRows((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addPlanRow() {
    // With a free-text year field the last row may hold junk — fall back to
    // the current year rather than suggesting "NaN".
    const last = planRows.length > 0 ? Number(planRows[planRows.length - 1].year) : NaN;
    const lastYear = Number.isFinite(last) ? last : new Date().getFullYear();
    setPlanRows((rows) => [...rows, { year: String(lastYear + 1), amount: '' }]);
  }

  function removePlanRow(index: number) {
    setPlanRows((rows) => rows.filter((_, i) => i !== index));
  }

  const canSave = (() => {
    if (name.trim() === '') {
      return false;
    }
    if (type === 'mortgage') {
      return (
        isMoneyValid(principal) &&
        isMoneyValid(monthlyPayment) &&
        rateValid &&
        principalAsOf !== '' &&
        fixationEnd !== ''
      );
    }
    if (type === 'family-loan') {
      return isMoneyValid(outstanding) && famAsOf !== '';
    }
    return true;
  })();

  async function handleSubmit() {
    if (!canSave) {
      return;
    }

    const next: Account = {
      id: account?.id ?? newId(),
      name: name.trim(),
      type,
      owner,
      active: account?.active ?? true,
    };

    if (type === 'mortgage') {
      const loan: MortgageLoan = {
        principalHalere: parseKcInput(principal) ?? 0,
        principalAsOf,
        annualRatePct: parsePercentInput(annualRatePct) ?? 0,
        monthlyPaymentHalere: parseKcInput(monthlyPayment) ?? 0,
        fixationEnd,
      };
      next.loan = loan;
    } else if (type === 'family-loan') {
      const plan: Record<string, number> = {};
      for (const row of planRows) {
        const halere = parseKcInput(row.amount);
        const year = row.year.trim();
        // Year is free text now (no type="number") — only a 4-digit year may
        // become a plan key.
        if (/^\d{4}$/.test(year) && halere !== null) {
          plan[year] = halere;
        }
      }
      const familyLoan: FamilyLoan = {
        outstandingHalere: parseKcInput(outstanding) ?? 0,
        asOf: famAsOf,
        paymentMonth,
        plan,
      };
      next.familyLoan = familyLoan;
    }

    const ok = await saveAccounts([next]);
    if (ok) {
      onDone();
    }
  }

  async function handleDeactivate() {
    if (!account) {
      return;
    }
    const ok = await saveAccounts([{ ...account, active: false }]);
    if (ok) {
      onDone();
    }
  }

  return (
    <section className={styles.formScreen}>
      <h1 className={styles.heading}>{account ? 'Edit account' : 'New account'}</h1>

      <div className={forms.field}>
        <label className={forms.label} htmlFor="acc-name">
          Name
        </label>
        <input
          id="acc-name"
          className={forms.input}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Air Bank checking"
        />
      </div>

      <div className={forms.row}>
        <div className={forms.field}>
          <label className={forms.label} htmlFor="acc-type">
            Type
          </label>
          <select
            id="acc-type"
            className={forms.select}
            value={type}
            onChange={(e) => setType(e.target.value as AccountType)}
          >
            {ACCOUNT_TYPE_ORDER.map((t) => (
              <option key={t} value={t}>
                {ACCOUNT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        <div className={forms.field}>
          <label className={forms.label} htmlFor="acc-owner">
            Owner
          </label>
          <select
            id="acc-owner"
            className={forms.select}
            value={owner}
            onChange={(e) => setOwner(e.target.value as AccountOwner)}
          >
            <option value="joint">Joint</option>
            <option value="A">A</option>
            <option value="B">B</option>
          </select>
        </div>
      </div>

      {type !== 'mortgage' && type !== 'family-loan' && (
        <p className={styles.snapshotHint}>
          You&apos;ll enter this account&apos;s balance when you take a net-worth snapshot
          (Net worth tab).
        </p>
      )}

      {type === 'mortgage' && (
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Mortgage details</legend>
          <MoneyInput
            id="mort-principal"
            label="Principal owed"
            value={principal}
            onChange={setPrincipal}
          />
          <div className={forms.field}>
            <label className={forms.label} htmlFor="mort-asof">
              Principal as of
            </label>
            <input
              id="mort-asof"
              className={forms.input}
              type="date"
              value={principalAsOf}
              onChange={(e) => setPrincipalAsOf(e.target.value)}
            />
          </div>
          <div className={forms.field}>
            <label className={forms.label} htmlFor="mort-rate">
              Annual interest rate (%)
            </label>
            <input
              id="mort-rate"
              className={forms.input}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={annualRatePct}
              onChange={(e) => setAnnualRatePct(e.target.value)}
              aria-invalid={!rateValid}
              placeholder="e.g. 4,9"
            />
            {!rateValid && (
              <span className={forms.error} role="alert">
                Enter a rate like 4,9 or 4.9
              </span>
            )}
          </div>
          <MoneyInput
            id="mort-payment"
            label="Monthly payment"
            value={monthlyPayment}
            onChange={setMonthlyPayment}
          />
          <div className={forms.field}>
            <label className={forms.label} htmlFor="mort-fixation">
              Fixation ends
            </label>
            <input
              id="mort-fixation"
              className={forms.input}
              type="date"
              value={fixationEnd}
              onChange={(e) => setFixationEnd(e.target.value)}
            />
          </div>
        </fieldset>
      )}

      {type === 'family-loan' && (
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Family loan details</legend>
          <MoneyInput
            id="fam-outstanding"
            label="Outstanding balance"
            value={outstanding}
            onChange={setOutstanding}
          />
          <div className={forms.row}>
            <div className={forms.field}>
              <label className={forms.label} htmlFor="fam-asof">
                Balance as of
              </label>
              <input
                id="fam-asof"
                className={forms.input}
                type="date"
                value={famAsOf}
                onChange={(e) => setFamAsOf(e.target.value)}
              />
            </div>
            <div className={forms.field}>
              <label className={forms.label} htmlFor="fam-month">
                Payment month
              </label>
              <select
                id="fam-month"
                className={forms.select}
                value={paymentMonth}
                onChange={(e) => setPaymentMonth(Number(e.target.value))}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <span className={forms.label}>Repayment plan (year → amount)</span>
          {planRows.map((row, index) => (
            <div className={styles.planRow} key={index}>
              <input
                className={forms.input}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                aria-label="Year"
                value={row.year}
                onChange={(e) => updatePlanRow(index, { year: e.target.value })}
                placeholder="2026"
              />
              <input
                className={forms.input}
                type="text"
                inputMode="numeric"
                aria-label="Planned amount"
                value={row.amount}
                onChange={(e) => updatePlanRow(index, { amount: e.target.value })}
                placeholder="Amount"
              />
              <button
                type="button"
                className={styles.rowRemove}
                onClick={() => removePlanRow(index)}
                aria-label="Remove year"
              >
                ×
              </button>
            </div>
          ))}
          <button type="button" className={forms.secondary} onClick={addPlanRow}>
            + Add year
          </button>
        </fieldset>
      )}

      <div className={forms.actions}>
        <button
          type="button"
          className={forms.primary}
          onClick={() => void handleSubmit()}
          disabled={!canSave || saving}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className={forms.secondary} onClick={onDone}>
          Cancel
        </button>
      </div>

      {account && account.active && (
        <div className={forms.actions}>
          <button
            type="button"
            className={forms.danger}
            onClick={() => void handleDeactivate()}
            disabled={saving}
          >
            Deactivate account
          </button>
        </div>
      )}
    </section>
  );
}
