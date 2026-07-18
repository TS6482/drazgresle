import { useState } from 'react';
import type { Category, Transaction } from '../../types/data';
import { parseKcInput } from '../../engine/money';
import { useDataStore } from '../../store/data';
import { navigate } from '../../router/useHashRoute';
import { todayIso } from '../../utils/dates';
import { newId } from '../../utils/id';
import { MoneyInput, isMoneyValid } from '../shared/MoneyInput';
import { CategoryPicker } from '../shared/CategoryPicker';
import forms from '../shared/forms.module.css';
import styles from './AddCash.module.css';

type Direction = 'expense' | 'income';

/** Active, non-transfer categories are the pickable targets for a quick-add. */
function pickable(category: Category): boolean {
  return category.active !== false && category.group !== 'transfer';
}

export function AddCash() {
  const categories = useDataStore((s) => s.categories);
  const saveTransaction = useDataStore((s) => s.saveTransaction);
  const saving = useDataStore((s) => s.saving);

  const firstCategory = categories.find(pickable);

  const [direction, setDirection] = useState<Direction>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(firstCategory?.id ?? null);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayIso());

  const amountValid = isMoneyValid(amount);
  const canSave = amountValid && date !== '';

  async function handleSubmit() {
    if (!canSave) {
      return;
    }
    const magnitude = Math.abs(parseKcInput(amount) ?? 0);
    const signed = direction === 'expense' ? -magnitude : magnitude;
    // The typed note is the user's own text, so it lands in `note` (older cash
    // entries stored it in `description` and still display as before).
    const tx: Transaction = {
      id: newId('tx'),
      date,
      amountHalere: signed,
      counterparty: '',
      description: '',
      account: '',
      categoryId,
      source: 'cash',
    };
    if (note.trim() !== '') {
      tx.note = note.trim();
    }
    const ok = await saveTransaction(tx);
    if (ok) {
      navigate('/');
    }
  }

  return (
    <section className={styles.screen}>
      <h1 className={styles.heading}>Add cash entry</h1>

      <div className={styles.toggle} role="group" aria-label="Direction">
        <button
          type="button"
          className={`${styles.toggleBtn} ${direction === 'expense' ? styles.toggleActive : ''}`}
          aria-pressed={direction === 'expense'}
          onClick={() => setDirection('expense')}
        >
          Expense
        </button>
        <button
          type="button"
          className={`${styles.toggleBtn} ${direction === 'income' ? styles.toggleActive : ''}`}
          aria-pressed={direction === 'income'}
          onClick={() => setDirection('income')}
        >
          Income
        </button>
      </div>

      <div className={styles.card}>
        <MoneyInput id="cash-amount" label="Amount" value={amount} onChange={setAmount} />

        <div className={forms.field}>
          <label className={forms.label} htmlFor="cash-category">
            Category
          </label>
          {firstCategory ? (
            <CategoryPicker
              id="cash-category"
              value={categoryId}
              onChange={setCategoryId}
              categories={categories}
              filter={pickable}
              includeNone
              noneLabel="No category yet"
            />
          ) : (
            <p className={styles.muted}>
              No categories yet — add some in Settings, or save now and categorize later.
            </p>
          )}
        </div>

        <div className={forms.field}>
          <label className={forms.label} htmlFor="cash-note">
            Note (optional)
          </label>
          <input
            id="cash-note"
            className={forms.input}
            type="text"
            autoComplete="off"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. lunch, market"
          />
        </div>

        <div className={forms.field}>
          <label className={forms.label} htmlFor="cash-date">
            Date
          </label>
          <input
            id="cash-date"
            className={forms.input}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={() => void handleSubmit()}
          disabled={!canSave || saving}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className={styles.secondaryBtn} onClick={() => navigate('/')}>
          Cancel
        </button>
      </div>
    </section>
  );
}
