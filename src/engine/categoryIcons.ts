// Resolves the icon + colour to show for a category. Pure — no React, no I/O.
// The GLYPH resolves by stored value → seeded id-default → generic fallback. The
// COLOUR now mirrors the spending gauge: expense categories take their spending
// area's colour and savings the neutral "saved" colour, so an icon reads the same
// hue as its arc segment. Income (no gauge segment) and other groups keep the old
// stored/default colour. Ids are plain strings (ICON_LIBRARY / ICON_COLORS ids)
// so the engine stays decoupled from the UI glyph/colour modules.

import type { Category } from '../types/data';
import { areaOf } from './areas';
import { isExpenseGroup, isSavingsGroup } from './summarize';

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
 * The colour id for a category. Savings → the neutral "saved" area colour;
 * expense → its spending area's colour (`area-<area>`); everything else (income,
 * transfer, unknown) keeps the legacy stored/default colour, since the gauge has
 * no segment for them.
 */
function resolveColorId(category: Category, def: CategoryIconRef | undefined): string {
  if (isSavingsGroup(category.group)) {
    return 'area-saved';
  }
  if (isExpenseGroup(category.group)) {
    return `area-${areaOf(category)}`;
  }
  return category.color ?? def?.colorId ?? FALLBACK_ICON.colorId;
}

/**
 * The icon + colour to render for a category. The glyph resolves from the stored
 * value, else the id-default, else the generic tag fallback; the colour is
 * derived from the category's group/area (see `resolveColorId`).
 */
export function resolveCategoryIcon(category: Category): CategoryIconRef {
  const def = DEFAULT_BY_ID[category.id];
  return {
    iconId: category.icon ?? def?.iconId ?? FALLBACK_ICON.iconId,
    colorId: resolveColorId(category, def),
  };
}
