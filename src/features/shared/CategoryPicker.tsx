import { useState } from 'react';
import type { Category, CategoryGroup } from '../../types/data';
import { uniqueSlug } from '../../engine/slug';
import { useDataStore } from '../../store/data';
import { CATEGORY_GROUP_LABELS, CATEGORY_GROUP_ORDER } from './labels';
import forms from './forms.module.css';

interface CategoryPickerProps {
  id: string;
  /** Selected category id, or null for "no category". */
  value: string | null;
  onChange: (value: string | null) => void;
  categories: Category[];
  /** Show a leading "Unclassified" option (maps to null). Default false. */
  includeNone?: boolean;
  /** Label for the none option. Default "Unclassified". */
  noneLabel?: string;
  /** Only offer categories matching this predicate. Default: active only. */
  filter?: (category: Category) => boolean;
}

const NONE_VALUE = '';
/** Sentinel option that opens the inline "new category" form. Never a real id
 *  (real ids are slugs and cannot contain '+'). */
const NEW_VALUE = '+new';

/** Groups offered when creating a category inline — everything except the
 *  reserved transfer group. */
const CREATABLE_GROUPS: CategoryGroup[] = CATEGORY_GROUP_ORDER.filter((g) => g !== 'transfer');

/**
 * A category `<select>` grouped by category group, shared by the add/edit and
 * import-review UIs. The trailing "+ New category…" option opens a compact
 * inline form (no route change — mid-flow state like an import review survives)
 * that saves through the store and then selects the new category exactly as if
 * it had been picked.
 */
export function CategoryPicker({
  id,
  value,
  onChange,
  categories,
  includeNone = false,
  noneLabel = 'Unclassified',
  filter,
}: CategoryPickerProps) {
  const saveCategories = useDataStore((s) => s.saveCategories);
  const saving = useDataStore((s) => s.saving);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newGroup, setNewGroup] = useState<CategoryGroup>('variable');
  const [createError, setCreateError] = useState<string | null>(null);

  const predicate = filter ?? ((c: Category) => c.active !== false);
  // Always keep the currently-selected category visible, even if inactive.
  const visible = categories.filter((c) => predicate(c) || c.id === value);

  const groups = CATEGORY_GROUP_ORDER.map((group) => ({
    group,
    items: visible.filter((c) => c.group === group),
  })).filter((g) => g.items.length > 0);

  function handleSelect(raw: string) {
    if (raw === NEW_VALUE) {
      // Open the form; onChange is NOT called, so the controlled select snaps
      // back to the previous value — cancel needs no extra bookkeeping.
      setCreating(true);
      return;
    }
    setCreating(false);
    onChange(raw === NONE_VALUE ? null : raw);
  }

  async function handleCreate() {
    const name = newName.trim();
    if (name === '') {
      return;
    }
    const newId = uniqueSlug(name, new Set(categories.map((c) => c.id)));
    const ok = await saveCategories([{ id: newId, name, group: newGroup }]);
    if (!ok) {
      // Keep the form (and the typed name) so nothing is lost on a flaky save.
      setCreateError('Could not save the category — check your connection and try again.');
      return;
    }
    setCreating(false);
    setNewName('');
    setNewGroup('variable');
    setCreateError(null);
    onChange(newId);
  }

  function handleCancel() {
    setCreating(false);
    setNewName('');
    setCreateError(null);
  }

  return (
    <div className={forms.pickerStack}>
      <select
        id={id}
        className={forms.select}
        value={value ?? NONE_VALUE}
        onChange={(e) => handleSelect(e.target.value)}
      >
        {includeNone && <option value={NONE_VALUE}>{noneLabel}</option>}
        {groups.map((g) => (
          <optgroup key={g.group} label={CATEGORY_GROUP_LABELS[g.group]}>
            {g.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.active === false ? ' (inactive)' : ''}
              </option>
            ))}
          </optgroup>
        ))}
        <option value={NEW_VALUE}>+ New category…</option>
      </select>

      {creating && (
        <div className={forms.inlineCreate}>
          <div className={forms.field}>
            <label className={forms.label} htmlFor={`${id}-new-name`}>
              New category name
            </label>
            <input
              id={`${id}-new-name`}
              className={forms.input}
              type="text"
              autoComplete="off"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Pets"
            />
          </div>
          <div className={forms.field}>
            <label className={forms.label} htmlFor={`${id}-new-group`}>
              Group
            </label>
            <select
              id={`${id}-new-group`}
              className={forms.select}
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value as CategoryGroup)}
            >
              {CREATABLE_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {CATEGORY_GROUP_LABELS[g]}
                </option>
              ))}
            </select>
          </div>
          {createError && (
            <span className={forms.error} role="alert">
              {createError}
            </span>
          )}
          <div className={forms.actionsTight}>
            <button
              type="button"
              className={forms.primary}
              onClick={() => void handleCreate()}
              disabled={newName.trim() === '' || saving}
            >
              {saving ? 'Saving…' : 'Save category'}
            </button>
            <button type="button" className={forms.secondary} onClick={handleCancel}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
