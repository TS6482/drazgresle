import { useState } from 'react';
import type { Category, HouseholdGoals, Person, PersonId } from '../../types/data';
import { parseKcInput } from '../../engine/money';
import { parsePercentInput } from '../../engine/percent';
import { TRANSFER_CATEGORY_ID } from '../../engine/summarize';
import { SPENDING_AREAS, areaIcon, areaOf } from '../../engine/areas';
import { resolveCategoryIcon } from '../../engine/categoryIcons';
import { useDataStore } from '../../store/data';
import { useSessionStore } from '../../store/session';
import { newId } from '../../utils/id';
import { normalizeCategoryGroup } from '../shared/labels';
import { MoneyInput } from '../shared/MoneyInput';
import { CategoryIcon } from '../shared/icons/CategoryIcon';
import { ICON_LIBRARY } from '../shared/icons/glyphs';
import forms from '../shared/forms.module.css';
import styles from './Settings.module.css';

const PERSON_IDS: PersonId[] = ['A', 'B'];

/** Selectable pay-cycle start days (1–28; a select avoids numeric parsing). */
const PAY_CYCLE_START_DAYS: number[] = Array.from({ length: 28 }, (_, i) => i + 1);

/**
 * Which of the 7 top-level category groups is open as a subpage. `null` (in
 * component state) means the top-level list of groups is showing instead.
 */
type CatGroupSel = { kind: 'area'; id: string } | { kind: 'income' } | { kind: 'savings' };

/**
 * The top-level group a draft belongs to, as a stable string key: `income`,
 * `savings` (income/savings groups plus any reserved-transfer category), or
 * `area:<id>` for an expense category (legacy fixed/variable included), keyed by
 * its spending area (unassigned → `others`).
 */
function catGroupKey(cat: Category): string {
  if (isReservedTransfer(cat)) {
    return 'savings';
  }
  const group = normalizeCategoryGroup(cat.group);
  if (group === 'income') {
    return 'income';
  }
  if (group === 'savings') {
    return 'savings';
  }
  return `area:${areaOf(cat)}`;
}

/** The `catGroupKey` a given open-subpage selection corresponds to. */
function selKey(sel: CatGroupSel): string {
  if (sel.kind === 'income') {
    return 'income';
  }
  if (sel.kind === 'savings') {
    return 'savings';
  }
  return `area:${sel.id}`;
}

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
  const prefs = useDataStore((s) => s.prefs);
  const savePrefs = useDataStore((s) => s.savePrefs);
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
  // Which top-level group's subpage is open; null = the top-level group list.
  const [openCatGroup, setOpenCatGroup] = useState<CatGroupSel | null>(null);
  // The category whose icon picker is open, if any.
  const [iconPickerFor, setIconPickerFor] = useState<string | null>(null);
  // Set while an icon/colour save is in flight so the store-triggered reseed
  // below keeps our optimistic drafts (and other rows' unsaved edits) instead
  // of resetting every draft to the just-saved store value.
  const [skipCategoryReseed, setSkipCategoryReseed] = useState(false);

  // Navigate between subpages, clearing per-subpage transient state so a typed
  // name or an open icon picker never leaks from one group's subpage to another.
  function openGroup(sel: CatGroupSel | null) {
    setOpenCatGroup(sel);
    setNewName('');
    setIconPickerFor(null);
  }

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

  /**
   * Add a category scoped to the currently open subpage: an area subpage creates
   * an expense category in that area; Income/Savings create a category in that
   * group. The group/area comes from `sel`, not a separate group-select.
   */
  function addCategory(sel: CatGroupSel) {
    if (newName.trim() === '') {
      return;
    }
    const base = { id: newId('cat'), name: newName.trim(), active: true };
    const cat: Category =
      sel.kind === 'area'
        ? { ...base, group: 'expense', area: sel.id }
        : sel.kind === 'income'
          ? { ...base, group: 'income' }
          : { ...base, group: 'savings' };
    setDrafts((prev) => [...prev, cat]);
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

  // Active-category count per top-level group key, for the top-level rows.
  const activeCounts = new Map<string, number>();
  for (const cat of drafts) {
    if (cat.active === false) {
      continue;
    }
    const key = catGroupKey(cat);
    activeCounts.set(key, (activeCounts.get(key) ?? 0) + 1);
  }

  // The 7 top-level rows: the 5 spending areas (in order), then Income, Savings.
  const topRows: { key: string; sel: CatGroupSel; name: string; icon: string; color: string }[] =
    [
      ...SPENDING_AREAS.map((a) => ({
        key: `area:${a.id}`,
        sel: { kind: 'area', id: a.id } as CatGroupSel,
        name: a.name,
        icon: areaIcon(a.id),
        color: `area-${a.id}`,
      })),
      { key: 'income', sel: { kind: 'income' }, name: 'Income', icon: 'banknote', color: 'green' },
      {
        key: 'savings',
        sel: { kind: 'savings' },
        name: 'Savings',
        icon: 'briefcase',
        color: 'area-saved',
      },
    ];

  // When a subpage is open: its key, display name, and just its categories.
  const openKey = openCatGroup ? selKey(openCatGroup) : null;
  const openName = openKey ? (topRows.find((r) => r.key === openKey)?.name ?? '') : '';
  const subpageDrafts = openKey ? drafts.filter((cat) => catGroupKey(cat) === openKey) : [];
  // The "Spending area" per-row select is offered only on area subpages.
  const showAreaSelect = openCatGroup?.kind === 'area';

  return (
    <section className={styles.screen}>
      <h1 className={styles.heading}>Settings</h1>

      <section className={styles.group}>
        <h2 className={styles.groupHeading}>People</h2>
        <p className={styles.muted}>
          Salaries and bonus feed the projections coming in a later phase.
        </p>
        <div className={styles.card}>
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
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => void savePeople()}
            disabled={saving || !peopleValid}
          >
            {saving ? 'Saving…' : 'Save people'}
          </button>
        </div>
      </section>

      <section className={styles.group}>
        <h2 className={styles.groupHeading}>Monthly goal</h2>
        <div className={styles.card}>
          <MoneyInput
            id="goal-leftover"
            label="Leave at least this much at month-end"
            hint="Compared to what's left after spending and saving."
            value={goalDraft}
            onChange={setGoalDraft}
            allowEmpty
          />
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => void saveGoal()}
            disabled={saving || !goalValid}
          >
            {saving ? 'Saving…' : 'Save goal'}
          </button>
        </div>
      </section>

      <section className={styles.group}>
        <h2 className={styles.groupHeading}>Month view</h2>
        <div className={styles.card}>
          <div className={forms.field}>
            <label className={forms.label} htmlFor="pay-cycle-start">
              Pay-cycle start day
            </label>
            <select
              id="pay-cycle-start"
              className={forms.select}
              value={prefs.payCycleStartDay ?? 10}
              onChange={(e) => void savePrefs({ ...prefs, payCycleStartDay: Number(e.target.value) })}
            >
              {PAY_CYCLE_START_DAYS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <p className={forms.hint}>
              Your salary lands around this day. The pay-cycle view on the Month screen runs from
              here to the day before next month&apos;s.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.group}>
        <h2 className={styles.groupHeading}>Categories</h2>
        <p className={styles.muted}>
          Categories are never deleted (transactions reference them) — deactivate to hide from
          pickers.
        </p>

        {openCatGroup === null ? (
          // Top-level: the 7 tappable group rows.
          <ul className={styles.groupNav}>
            {topRows.map((row) => (
              <li key={row.key}>
                <button
                  type="button"
                  className={styles.groupNavRow}
                  onClick={() => openGroup(row.sel)}
                >
                  <CategoryIcon iconId={row.icon} color={row.color} size={32} />
                  <span className={styles.groupNavName}>{row.name}</span>
                  <span className={styles.groupNavCount}>{activeCounts.get(row.key) ?? 0}</span>
                  <span className={styles.groupNavChevron} aria-hidden="true">
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          // Subpage: just this group's categories, editable, plus a scoped add.
          <>
            <div className={styles.subpageBack}>
              <button
                type="button"
                className={styles.backBtn}
                onClick={() => openGroup(null)}
              >
                ‹ Categories
              </button>
            </div>
            <h3 className={styles.subpageHeading}>{openName}</h3>

            <ul className={styles.catList}>
              {subpageDrafts.map((cat) => {
                const reserved = isReservedTransfer(cat);
                const inactive = cat.active === false;
                const resolved = resolveCategoryIcon(cat);
                const pickerOpen = iconPickerFor === cat.id;
                return (
                  <li
                    key={cat.id}
                    className={`${styles.catRow} ${inactive ? styles.catInactive : ''}`}
                  >
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
                      <div className={styles.catMainSingle}>
                        <input
                          className={forms.input}
                          type="text"
                          aria-label="Category name"
                          value={cat.name}
                          disabled={reserved}
                          onChange={(e) => updateDraft(cat.id, { name: e.target.value })}
                        />
                      </div>
                      {reserved ? (
                        <span className={styles.reserved}>Reserved</span>
                      ) : (
                        <button
                          type="button"
                          className={`${styles.catToggle} ${inactive ? styles.catToggleRestore : ''}`}
                          onClick={() => toggleActive(cat.id)}
                          aria-label={`${inactive ? 'Reactivate' : 'Deactivate'} ${cat.name || 'category'}`}
                          title={inactive ? 'Reactivate' : 'Deactivate'}
                        >
                          {inactive ? '↺' : '×'}
                        </button>
                      )}
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
                    {showAreaSelect && !reserved && (
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

            <fieldset className={styles.addCard}>
              <legend className={styles.legend}>Add a category</legend>
              <div className={styles.addRowSingle}>
                <input
                  className={forms.input}
                  type="text"
                  aria-label="New category name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Name"
                />
                <button
                  type="button"
                  className={styles.toggleBtn}
                  onClick={() => addCategory(openCatGroup)}
                  disabled={newName.trim() === ''}
                >
                  + Add
                </button>
              </div>
            </fieldset>

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => void saveCategoryDrafts()}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save categories'}
              </button>
            </div>
          </>
        )}
      </section>

      <section className={styles.group}>
        <h2 className={styles.groupHeading}>Connection</h2>
        <div className={styles.card}>
          <p className={styles.muted}>Connected as {username}</p>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.disconnect} onClick={handleDisconnect}>
            Disconnect
          </button>
        </div>
      </section>
    </section>
  );
}
