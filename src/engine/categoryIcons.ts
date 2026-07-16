// Resolves the icon + colour to show for a category. Pure — no React, no I/O.
// Resolution order for each of icon and colour: the value stored on the category
// wins, then the built-in default for its (seeded) id, then a generic fallback.
// Ids are plain strings here (ICON_LIBRARY / ICON_COLORS ids) so the engine stays
// decoupled from the UI glyph/colour modules.

import type { Category } from '../types/data';

/** An icon reference: an ICON_LIBRARY id and an ICON_COLORS id. */
export interface CategoryIconRef {
  iconId: string;
  colorId: string;
}

/** Generic fallback when neither a stored value nor an id-default applies. */
export const FALLBACK_ICON: CategoryIconRef = { iconId: 'tag', colorId: 'gray' };

/**
 * Built-in icon/colour for each seeded category id. These are derived in code
 * (no data-repo migration needed); a category may still override them via its
 * own `icon`/`color` fields.
 */
const DEFAULT_BY_ID: Record<string, CategoryIconRef> = {
  housing: { iconId: 'house', colorId: 'blue' },
  mortgage: { iconId: 'building', colorId: 'indigo' },
  insurance: { iconId: 'shield', colorId: 'gray' },
  'mobile-phone-services': { iconId: 'phone', colorId: 'teal' },
  transport: { iconId: 'car', colorId: 'blue' },
  health: { iconId: 'heart', colorId: 'red' },
  groceries: { iconId: 'cart', colorId: 'green' },
  'eating-out': { iconId: 'fork-knife', colorId: 'orange' },
  shopping: { iconId: 'bag', colorId: 'pink' },
  fun: { iconId: 'star', colorId: 'purple' },
  travel: { iconId: 'airplane', colorId: 'teal' },
  subscriptions: { iconId: 'arrows-repeat', colorId: 'indigo' },
  kids: { iconId: 'child', colorId: 'teal' },
  other: { iconId: 'tag', colorId: 'gray' },
  'cash-withdrawal': { iconId: 'banknote', colorId: 'green' },
  investments: { iconId: 'chart-uptrend', colorId: 'green' },
  salary: { iconId: 'briefcase', colorId: 'blue' },
  'friend-payments': { iconId: 'two-people', colorId: 'orange' },
  'cash-income': { iconId: 'banknote', colorId: 'green' },
  transfer: { iconId: 'arrows-left-right', colorId: 'gray' },
};

/**
 * The icon + colour to render for a category. Icon and colour resolve
 * independently: a stored value wins for that field, else the id-default, else
 * the generic tag/gray fallback.
 */
export function resolveCategoryIcon(category: Category): CategoryIconRef {
  const def = DEFAULT_BY_ID[category.id];
  return {
    iconId: category.icon ?? def?.iconId ?? FALLBACK_ICON.iconId,
    colorId: category.color ?? def?.colorId ?? FALLBACK_ICON.colorId,
  };
}
