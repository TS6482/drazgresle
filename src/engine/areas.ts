// Spending areas: an organizing layer OVER expense categories. Each expense
// category is assigned to one fixed spending area (Category.area); areas group
// categories for the Month view and reporting only — they do NOT change the
// Income/Spent/Saved/Left-over accounting. Pure — no React, no I/O.

import type { Category } from '../types/data';
import type { CategorySummary } from './summarize';
import { isExpenseGroup } from './summarize';

/** A fixed spending area. `id` is stored on categories; `name` is user-facing. */
export interface SpendingArea {
  id: string;
  name: string;
}

/**
 * The fixed spending areas, in display order. `others` is the fallback bucket
 * for expense categories with no (or an unknown) area assigned.
 */
export const SPENDING_AREAS: SpendingArea[] = [
  { id: 'essential', name: 'Essential Living' },
  { id: 'food', name: 'Food' },
  { id: 'entertainment', name: 'Entertainment' },
  { id: 'kids', name: 'Kids' },
  { id: 'others', name: 'Others' },
];

const AREA_BY_ID = new Map<string, SpendingArea>(SPENDING_AREAS.map((a) => [a.id, a]));

/** The fallback area id for an unassigned or unknown-area expense category. */
const FALLBACK_AREA_ID = 'others';

/** The display name for an area id; an unknown id resolves to "Others". */
export function areaName(id: string): string {
  return AREA_BY_ID.get(id)?.name ?? 'Others';
}

/**
 * The area a category belongs to: its stored `area` when set to a known id,
 * otherwise `'others'` (the fallback for unassigned/unknown expense categories).
 * Meaningful only for expense categories — callers filter to those first.
 */
export function areaOf(category: Category): string {
  const area = category.area;
  if (area !== undefined && AREA_BY_ID.has(area)) {
    return area;
  }
  return FALLBACK_AREA_ID;
}

/** One area's total spend, for the meter/list. */
export interface AreaSpend {
  areaId: string;
  name: string;
  spendHalere: number;
}

/**
 * Sum each EXPENSE-group category summary's `spendHalere` into its category's
 * spending area (unassigned/unknown → `others`). Income, savings, transfer, and
 * unknown-group rows are ignored. Returns one entry per area in `SPENDING_AREAS`
 * order, including zeros — the UI filters out empty areas.
 */
export function spendingByArea(
  rows: CategorySummary[],
  byId: Map<string, Category>,
): AreaSpend[] {
  const totals = new Map<string, number>();
  for (const area of SPENDING_AREAS) {
    totals.set(area.id, 0);
  }

  for (const row of rows) {
    if (!isExpenseGroup(row.group)) {
      continue;
    }
    const category = byId.get(row.categoryId);
    const areaId = category ? areaOf(category) : FALLBACK_AREA_ID;
    totals.set(areaId, (totals.get(areaId) ?? 0) + row.spendHalere);
  }

  return SPENDING_AREAS.map((area) => ({
    areaId: area.id,
    name: area.name,
    spendHalere: totals.get(area.id) ?? 0,
  }));
}
