import { useState } from 'react';
import type { Category, CategoryGroup, Person, PersonId } from '../../types/data';
import { parseKcInput } from '../../engine/money';
import { parsePercentInput } from '../../engine/percent';
import { isExpenseGroup, TRANSFER_CATEGORY_ID } from '../../engine/summarize';
import { SPENDING_AREAS } from '../../engine/areas';
import { useDataStore } from '../../store/data';
import { newId } from '../../utils/id';
import { CATEGORY_GROUP_LABELS, normalizeCategoryGroup } from '../shared/labels';
import { MoneyInput } from '../shared/MoneyInput';
import forms from '../shared/forms.module.css';
import styles from './Settings.module.css';

const PERSON_IDS: PersonId[] = ['A', 'B'];

/** Groups a user may assign — income / expense / savings. The reserved transfer
 *  group and the legacy fixed/variable groups are never offered. */
const ASSIGNABLE_GROUPS: CategoryGroup[] = ['income', 'expense', 'savings'];

interface PersonDraft {
  id: PersonId;
  name: string;
  salary: string;
  bonus: string;
}

function halereToString(halere: number | undefined): string {
  return halere ? String(Math.round(halere / 100)) : '';
}

/** The transfer category is reserved: never renamed, deactivated, or deleted. */
function isReservedTransfer(category: Category): boolean {
  return category.id === TRANSFER_CATEGORY_ID || category.group === 'transfer';
}

/** Build the two editable person rows (A, B) from the stored persons. */
function buildPeople(storePersons: Person[]): PersonDraft[] {
  return PERSON_IDS.map((id) => {
    const p = storePersons.find((person) => person.id === id);
    return {
      id,
      name: p?.name ?? '',
      salary: halereToString(p?.grossMonthlySalaryHalere),
      bonus: p && p.annualBonusPct ? String(p.annualBonusPct) : '',
    };
  });
}

export function Settings() {
  const storePersons = useDataStore((s) => s.persons);
  const projectionDefaults = useDataStore((s) => s.projectionDefaults);
  const categories = useDataStore((s) => s.categories);
  const saveSettings = useDataStore((s) => s.saveSettings);
  const saveCategories = useDataStore((s) => s.saveCategories);
  const saving = useDataStore((s) => s.saving);

  const [people, setPeople] = useState<PersonDraft[]>(() => buildPeople(storePersons));
  const [drafts, setDrafts] = useState<Category[]>(() => categories.map((c) => ({ ...c })));
  const [newName, setNewName] = useState('');
  const [newGroup, setNewGroup] = useState<CategoryGroup>('expense');

  // Reseed (during render, React's recommended pattern) when the stored data
  // changes — e.g. after the initial load resolves or a save completes.
  const [seedPersons, setSeedPersons] = useState(storePersons);
  if (seedPersons !== storePersons) {
    setSeedPersons(storePersons);
    setPeople(buildPeople(storePersons));
  }
  const [seedCategories, setSeedCategories] = useState(categories);
  if (seedCategories !== categories) {
    setSeedCategories(categories);
    setDrafts(categories.map((c) => ({ ...c })));
  }

  function updatePerson(id: PersonId, patch: Partial<PersonDraft>) {
    setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  async function savePeople() {
    const persons: Person[] = people.map((p) => ({
      id: p.id,
      name: p.name.trim(),
      grossMonthlySalaryHalere: parseKcInput(p.salary) ?? 0,
      annualBonusPct: parsePercentInput(p.bonus) ?? 0,
    }));
    await saveSettings(persons, projectionDefaults);
  }

  function updateDraft(id: string, patch: Partial<Category>) {
    setDrafts((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function toggleActive(id: string) {
    setDrafts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, active: c.active === false } : c)),
    );
  }

  function addCategory() {
    if (newName.trim() === '') {
      return;
    }
    setDrafts((prev) => [
      ...prev,
      { id: newId('cat'), name: newName.trim(), group: newGroup, active: true },
    ]);
    setNewName('');
  }

  async function saveCategoryDrafts() {
    const cleaned = drafts
      .filter((c) => c.name.trim() !== '')
      .map((c) => ({ ...c, name: c.name.trim() }));
    await saveCategories(cleaned);
  }

  const peopleValid = people.every(
    (p) =>
      (p.salary.trim() === '' || parseKcInput(p.salary) !== null) &&
      (p.bonus.trim() === '' || parsePercentInput(p.bonus) !== null),
  );

  return (
    <section className={styles.screen}>
      <h1 className={styles.heading}>Settings</h1>

      <div className={styles.card}>
        <h2 className={styles.cardHeading}>People</h2>
        <p className={styles.muted}>
          Salaries and bonus feed the projections coming in a later phase.
        </p>
        {people.map((p) => (
          <fieldset key={p.id} className={styles.fieldset}>
            <legend className={styles.legend}>Person {p.id}</legend>
            <div className={forms.field}>
              <label className={forms.label} htmlFor={`name-${p.id}`}>
                Name
              </label>
              <input
                id={`name-${p.id}`}
                className={forms.input}
                type="text"
                autoComplete="off"
                value={p.name}
                onChange={(e) => updatePerson(p.id, { name: e.target.value })}
                placeholder={`Person ${p.id}`}
              />
            </div>
            <MoneyInput
              id={`salary-${p.id}`}
              label="Gross monthly salary"
              value={p.salary}
              onChange={(v) => updatePerson(p.id, { salary: v })}
              allowEmpty
            />
            <div className={forms.field}>
              <label className={forms.label} htmlFor={`bonus-${p.id}`}>
                Annual bonus (%)
              </label>
              <input
                id={`bonus-${p.id}`}
                className={forms.input}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={p.bonus}
                onChange={(e) => updatePerson(p.id, { bonus: e.target.value })}
                aria-invalid={p.bonus.trim() !== '' && parsePercentInput(p.bonus) === null}
                placeholder="e.g. 8,5"
              />
            </div>
          </fieldset>
        ))}
        <div className={forms.actions}>
          <button
            type="button"
            className={forms.primary}
            onClick={() => void savePeople()}
            disabled={saving || !peopleValid}
          >
            {saving ? 'Saving…' : 'Save people'}
          </button>
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardHeading}>Categories</h2>
        <p className={styles.muted}>
          Categories are never deleted (transactions reference them) — deactivate to hide from
          pickers.
        </p>

        <ul className={styles.catList}>
          {drafts.map((cat) => {
            const reserved = isReservedTransfer(cat);
            const inactive = cat.active === false;
            // Legacy fixed/variable categories display as "Expense"; their
            // stored group is left untouched unless the user changes it here.
            const groupValue = reserved ? cat.group : normalizeCategoryGroup(cat.group);
            // Spending areas apply only to expense categories (incl. legacy).
            const showArea = isExpenseGroup(cat.group);
            return (
              <li key={cat.id} className={`${styles.catRow} ${inactive ? styles.catInactive : ''}`}>
                <div className={styles.catMain}>
                  <input
                    className={forms.input}
                    type="text"
                    aria-label="Category name"
                    value={cat.name}
                    disabled={reserved}
                    onChange={(e) => updateDraft(cat.id, { name: e.target.value })}
                  />
                  <select
                    className={forms.select}
                    aria-label="Category group"
                    value={groupValue}
                    disabled={reserved}
                    onChange={(e) => updateDraft(cat.id, { group: e.target.value as CategoryGroup })}
                  >
                    {(reserved ? [cat.group] : ASSIGNABLE_GROUPS).map((g) => (
                      <option key={g} value={g}>
                        {CATEGORY_GROUP_LABELS[g]}
                      </option>
                    ))}
                  </select>
                  {reserved ? (
                    <span className={styles.reserved}>Reserved</span>
                  ) : (
                    <button
                      type="button"
                      className={styles.toggleBtn}
                      onClick={() => toggleActive(cat.id)}
                    >
                      {inactive ? 'Reactivate' : 'Deactivate'}
                    </button>
                  )}
                </div>
                {showArea && (
                  <div className={styles.catArea}>
                    <label className={styles.catAreaLabel} htmlFor={`area-${cat.id}`}>
                      Spending area
                    </label>
                    <select
                      id={`area-${cat.id}`}
                      className={forms.select}
                      value={cat.area ?? 'others'}
                      onChange={(e) => updateDraft(cat.id, { area: e.target.value })}
                    >
                      {SPENDING_AREAS.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Add a category</legend>
          <div className={styles.addRow}>
            <input
              className={forms.input}
              type="text"
              aria-label="New category name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name"
            />
            <select
              className={forms.select}
              aria-label="New category group"
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value as CategoryGroup)}
            >
              {ASSIGNABLE_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {CATEGORY_GROUP_LABELS[g]}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={styles.toggleBtn}
              onClick={addCategory}
              disabled={newName.trim() === ''}
            >
              + Add
            </button>
          </div>
        </fieldset>

        <div className={forms.actions}>
          <button
            type="button"
            className={forms.primary}
            onClick={() => void saveCategoryDrafts()}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save categories'}
          </button>
        </div>
      </div>
    </section>
  );
}
