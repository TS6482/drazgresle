import { useMemo, useState } from 'react';
import type {
  Account,
  AccountOwner,
  AccountType,
  FamilyLoan,
  MortgageLoan,
  Purchase,
  Snapshot,
} from '../../types/data';
import { formatKc, parseKcInput } from '../../engine/money';
import { parsePercentInput } from '../../engine/percent';
import { planProgress } from '../../engine/familyLoan';
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

/** Purchase price + gain/loss are meaningful only for these two asset types. */
function isPurchaseType(type: AccountType): boolean {
  return type === 'property' || type === 'other-asset';
}

export function AccountForm({ account, onDone }: AccountFormProps) {
  const saveAccounts = useDataStore((s) => s.saveAccounts);
  const saveSnapshot = useDataStore((s) => s.saveSnapshot);
  const snapshots = useDataStore((s) => s.snapshots);
  const saving = useDataStore((s) => s.saving);

  const isCreating = account === undefined;

  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountType>(account?.type ?? 'checking');
  const [owner, setOwner] = useState<AccountOwner>(account?.owner ?? 'joint');
  // Own account number ("number/bankCode") — lets imports recognize transfers to
  // this account. Free text (contains "/"), so no numeric input mode.
  const [accountNumber, setAccountNumber] = useState(account?.accountNumber ?? '');
  // Air Bank statement-driven balance toggle (checking/savings only).
  const [fromStatements, setFromStatements] = useState(account?.statementSource === 'airbank');

  // Purchase fields (property / other-asset only). Date defaults blank so an
  // untouched form stays "neither filled" — both are required together.
  const [purchasePrice, setPurchasePrice] = useState(moneyToString(account?.purchase?.priceHalere));
  const [purchaseDate, setPurchaseDate] = useState(account?.purchase?.date ?? '');
  // Current value is offered only when CREATING — it seeds today's snapshot.
  const [currentValue, setCurrentValue] = useState('');

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

  // Purchase price + date are both-or-neither: a date without a price (or vice
  // versa) is rejected, and a filled price must parse.
  const priceFilled = purchasePrice.trim() !== '';
  const dateFilled = purchaseDate.trim() !== '';
  const purchaseValid =
    (!priceFilled && !dateFilled) || (priceFilled && dateFilled && isMoneyValid(purchasePrice));
  const currentValueValid = isMoneyValid(currentValue, true);

  // Live repayment progress for the family-loan plan table. Unparsed rows
  // (blank amount, non-4-digit year) are simply excluded — no crashes.
  const planPreview = useMemo(() => {
    const plan: Record<string, number> = {};
    for (const row of planRows) {
      const year = row.year.trim();
      const halere = parseKcInput(row.amount);
      if (/^\d{4}$/.test(year) && halere !== null) {
        plan[year] = halere;
      }
    }
    return planProgress(parseKcInput(outstanding) ?? 0, plan);
  }, [planRows, outstanding]);

  const remainderByYear = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of planPreview.rows) {
      map.set(row.year, row.remainderHalere);
    }
    return map;
  }, [planPreview]);

  const lastPlannedYear =
    planPreview.rows.length > 0 ? planPreview.rows[planPreview.rows.length - 1].year : null;

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
    if (isPurchaseType(type)) {
      return purchaseValid && currentValueValid;
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

    // Statement-driven balance applies only to bank accounts.
    if ((type === 'checking' || type === 'savings') && fromStatements) {
      next.statementSource = 'airbank';
    }

    const trimmedAccountNumber = accountNumber.trim();
    if (trimmedAccountNumber !== '') {
      next.accountNumber = trimmedAccountNumber;
    }

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
    } else if (isPurchaseType(type)) {
      if (priceFilled && dateFilled) {
        const price = parseKcInput(purchasePrice);
        if (price !== null) {
          const purchase: Purchase = { priceHalere: price, date: purchaseDate };
          next.purchase = purchase;
        }
      }
    }

    const ok = await saveAccounts([next]);
    if (!ok) {
      return;
    }

    // On create, an optional "current value" is recorded into today's snapshot —
    // merged onto any existing snapshot for today so other balances survive.
    if (isCreating && isPurchaseType(type) && currentValue.trim() !== '') {
      const value = parseKcInput(currentValue);
      if (value !== null) {
        const today = todayIso();
        const existing = snapshots.find((s) => s.date === today);
        const snap: Snapshot = {
          date: today,
          balances: { ...(existing?.balances ?? {}), [next.id]: value },
        };
        if (existing?.note !== undefined) {
          snap.note = existing.note;
        }
        await saveSnapshot(snap);
      }
    }

    onDone();
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

      <div className={forms.field}>
        <label className={forms.label} htmlFor="acc-number">
          Account number
        </label>
        <input
          id="acc-number"
          className={forms.input}
          type="text"
          autoComplete="off"
          value={accountNumber}
          onChange={(e) => setAccountNumber(e.target.value)}
          placeholder="1234567890/0800"
        />
        <span className={forms.hint}>
          Optional — lets imports recognize transfers to this account (&quot;1234567890/0800&quot;).
        </span>
      </div>

      {type !== 'mortgage' && type !== 'family-loan' && !isPurchaseType(type) && (
        <p className={styles.snapshotHint}>
          You&apos;ll enter this account&apos;s balance when you take a net-worth snapshot
          (Net worth tab).
        </p>
      )}

      {(type === 'checking' || type === 'savings') && (
        <label className={styles.checkboxRow} htmlFor="acc-from-statements">
          <input
            id="acc-from-statements"
            type="checkbox"
            checked={fromStatements}
            onChange={(e) => setFromStatements(e.target.checked)}
          />
          <span>
            Balance comes from Air Bank statements
            <span className={styles.snapshotHint}>
              {' '}
              — each imported statement&apos;s ending balance pre-fills this account at snapshot time.
            </span>
          </span>
        </label>
      )}

      {isPurchaseType(type) && (
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Purchase &amp; value (optional)</legend>
          <MoneyInput
            id="purchase-price"
            label="Purchase price"
            value={purchasePrice}
            onChange={setPurchasePrice}
            hint="What you originally paid — used to show gain/loss."
            allowEmpty
          />
          <div className={forms.field}>
            <label className={forms.label} htmlFor="purchase-date">
              Purchase date
            </label>
            <input
              id="purchase-date"
              className={forms.input}
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              aria-invalid={!purchaseValid}
            />
            {!purchaseValid && (
              <span className={forms.error} role="alert">
                Enter both a purchase price and date, or leave both blank.
              </span>
            )}
          </div>

          {isCreating && (
            <MoneyInput
              id="current-value"
              label="Current value"
              value={currentValue}
              onChange={setCurrentValue}
              hint="Optional — recorded into today's snapshot."
              allowEmpty
            />
          )}
        </fieldset>
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
          {planRows.map((row, index) => {
            const year = row.year.trim();
            const remainder = /^\d{4}$/.test(year) ? remainderByYear.get(year) : undefined;
            return (
              <div key={index}>
                <div className={styles.planRow}>
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
                {remainder !== undefined && (
                  <span className={styles.planRemainder}>→ {formatKc(remainder)} left</span>
                )}
              </div>
            );
          })}
          <button type="button" className={styles.secondaryBtn} onClick={addPlanRow}>
            + Add year
          </button>

          {planPreview.rows.length > 0 && (
            <p className={styles.planSummary}>
              {planPreview.summary.paidOffYear !== null
                ? `Fully repaid in ${planPreview.summary.paidOffYear}.`
                : `Still owing ${formatKc(planPreview.summary.shortfallHalere)} after ${lastPlannedYear}.`}
            </p>
          )}
        </fieldset>
      )}

      <div className={forms.actions}>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={() => void handleSubmit()}
          disabled={!canSave || saving}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className={styles.secondaryBtn} onClick={onDone}>
          Cancel
        </button>
      </div>

      {account && account.active && (
        <div className={forms.actions}>
          <button
            type="button"
            className={styles.deleteBtn}
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
