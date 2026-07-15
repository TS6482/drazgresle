import type { Category } from '../../types/data';
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

/** A category `<select>` grouped by category group, shared by the add/edit UIs. */
export function CategoryPicker({
  id,
  value,
  onChange,
  categories,
  includeNone = false,
  noneLabel = 'Unclassified',
  filter,
}: CategoryPickerProps) {
  const predicate = filter ?? ((c: Category) => c.active !== false);
  // Always keep the currently-selected category visible, even if inactive.
  const visible = categories.filter((c) => predicate(c) || c.id === value);

  const groups = CATEGORY_GROUP_ORDER.map((group) => ({
    group,
    items: visible.filter((c) => c.group === group),
  })).filter((g) => g.items.length > 0);

  return (
    <select
      id={id}
      className={forms.select}
      value={value ?? NONE_VALUE}
      onChange={(e) => onChange(e.target.value === NONE_VALUE ? null : e.target.value)}
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
    </select>
  );
}
