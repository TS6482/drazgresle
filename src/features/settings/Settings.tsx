import { useState } from 'react';
import type { Category, CategoryGroup, HouseholdGoals, Person, PersonId } from '../../types/data';
import { parseKcInput } from '../../engine/money';
import { parsePercentInput } from '../../engine/percent';
import { isExpenseGroup, TRANSFER_CATEGORY_ID } from '../../engine/summarize';
import { SPENDING_AREAS } from '../../engine/areas';
import { resolveCategoryIcon } from '../../engine/categoryIcons';
import { useDataStore } from '../../store/data';
import { useSessionStore } from '../../store/session';
import { newId } from '../../utils/id';
import { CATEGORY_GROUP_LABELS, normalizeCategoryGroup } from '../shared/labels';
import { MoneyInput } from '../shared/MoneyInput';
import { CategoryIcon } from '../shared/icons/CategoryIcon';
import { ICON_LIBRARY } from '../shared/icons/glyphs';
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
  const goals = useDataStore((s) => s.goals);
  const categories = useDataStore((s) => s.categories);
  const saveSettings = useDataStore((s) => s.saveSettings);
  const saveGoals = useDataStore((s) => s.saveGoals);
  const saveCategories = useDataStore((s) => s.saveCategories);
  const saving = useDataStore((s) => s.saving);
  const reset = useDataStore((s) => s.reset);
  const username = useSessionStore((s) => s.username);
  const disconnect = useSessionStore((s) => s.disconnect);

  const [people, setPeople] = useState<PersonDraft[]>(() => buildPeople(storePersons));
  const [drafts, setDrafts] = useState<Category[]>(() => categories.map((c) => ({ ...c })));
  const [goalDraft, setGoalDraft] = useState(() => halereToString(goals.monthlyLeftoverHalere));
  const [newName, setNewName] = useState('');
  const [newGroup, setNewGroup] = useState<CategoryGroup>('expense');
  // The category whose icon picker is open, if any.
  const [iconPickerFor, setIconPickerFor] = useState<string | null>(null);
  // Set while an icon/colour save is in flight so the store-triggered reseed
  // below keeps our optimistic drafts (and other rows' unsaved edits) instead
  // of resetting every draft to the just-saved store value.
  const [skipCategoryReseed, setSkipCategoryReseed] = useState(false);

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
    // An icon/colour save updated the store; keep the optimistic drafts (which
    // already hold that change plus any other unsaved row edits) rather than
    // overwriting them. Any other store change reseeds normally.
    if (skipCategoryReseed) {
      setSkipCategoryReseed(false);
    } else {
      setDrafts(categories.map((c) => ({ ...c })));
    }
  }
  const [seedGoals, setSeedGoals] = useState(goals);
  if (seedGoals !== goals) {
    setSeedGoals(goals);
    setGoalDraft(halereToString(goals.monthlyLeftoverHalere));
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

  /** Save the monthly leftover goal. Blank input clears the goal (store `{}`). */
  async function saveGoal() {
    const trimmed = goalDraft.trim();
    const parsed = parseKcInput(goalDraft);
    const next: HouseholdGoals =
      trimmed !== '' && parsed !== null ? { monthlyLeftoverHalere: parsed } : {};
    await saveGoals(next);
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

  /**
   * Persist an icon/colour choice for one category immediately, as its own
   * upsert, without disturbing other rows' unsaved edits. We update the draft
   * optimistically and set `skipCategoryReseed` so the store update this save
   * triggers does not reset every draft (see the reseed guard above). On a
   * failed save we revert both.
   */
  async function pickIcon(cat: Category, patch: { icon?: string; color?: string }) {
    const updated: Category = { ...cat, ...patch };
    setDrafts((prev) => prev.map((c) => (c.id === cat.id ? updated : c)));
    setSkipCategoryReseed(true);
    const ok = await saveCategories([updated]);
    if (!ok) {
      setSkipCategoryReseed(false);
      setDrafts((prev) => prev.map((c) => (c.id === cat.id ? cat : c)));
    }
  }

  async function saveCategoryDrafts() {
    const cleaned = drafts
      .filter((c) => c.name.trim() !== '')
      .map((c) => ({ ...c, name: c.name.trim() }));
    await saveCategories(cleaned);
  }

  /** Forget the loaded data, then the token — same order the old header used. */
  function handleDisconnect() {
    reset();
    disconnect();
  }

  const peopleValid = people.every(
    (p) =>
      (p.salary.trim() === '' || parseKcInput(p.salary) !== null) &&
      (p.bonus.trim() === '' || parsePercentInput(p.bonus) !== null),
  );

  const goalValid = goalDraft.trim() === '' || parseKcInput(goalDraft) !== null;

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
        <h2 className={styles.cardHeading}>Monthly goal</h2>
        <MoneyInput
          id="goal-leftover"
          label="Leave at least this much at month-end"
          hint="Compared to what's left after spending and saving."
          value={goalDraft}
          onChange={setGoalDraft}
          allowEmpty
        />
        <div className={forms.actions}>
          <button
            type="button"
            className={forms.primary}
            onClick={() => void saveGoal()}
            disabled={saving || !goalValid}
          >
            {saving ? 'Saving…' : 'Save goal'}
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
            const resolved = resolveCategoryIcon(cat);
            const pickerOpen = iconPickerFor === cat.id;
            return (
              <li key={cat.id} className={`${styles.catRow} ${inactive ? styles.catInactive : ''}`}>
                <div className={styles.catLead}>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => setIconPickerFor(pickerOpen ? null : cat.id)}
                    aria-label={`Change icon for ${cat.name || 'category'}`}
                    aria-expanded={pickerOpen}
                  >
                    <CategoryIcon iconId={resolved.iconId} color={resolved.colorId} size={32} />
                  </button>
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
                      onChange={(e) =>
                        updateDraft(cat.id, { group: e.target.value as CategoryGroup })
                      }
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
                </div>
                {pickerOpen && (
                  <div className={styles.iconPicker}>
                    <div className={styles.glyphGrid}>
                      {ICON_LIBRARY.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          className={styles.glyphBtn}
                          data-selected={resolved.iconId === g.id}
                          aria-label={g.label}
                          aria-pressed={resolved.iconId === g.id}
                          onClick={() => void pickIcon(cat, { icon: g.id })}
                        >
                          <CategoryIcon iconId={g.id} color={resolved.colorId} size={30} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
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

      <div className={styles.card}>
        <h2 className={styles.cardHeading}>Connection</h2>
        <p className={styles.muted}>Connected as {username}</p>
        <div className={forms.actions}>
          <button type="button" className={styles.disconnect} onClick={handleDisconnect}>
            Disconnect
          </button>
        </div>
      </div>
    </section>
  );
}
