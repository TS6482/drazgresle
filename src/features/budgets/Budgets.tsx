import { useMemo, useState } from 'react';
import type { Category, CategoryBudget } from '../../types/data';
import type { BudgetMap } from '../../engine/summarize';
import { parseKcInput } from '../../engine/money';
import { budgetFor, isExpenseGroup, isSavingsGroup } from '../../engine/summarize';
import { useDataStore } from '../../store/data';
import { navigate } from '../../router/useHashRoute';
import { formatMonthLabel, shiftMonth } from '../../utils/dates';
import { CATEGORY_GROUP_LABELS, CATEGORY_GROUP_ORDER } from '../shared/labels';
import { MoneyInput } from '../shared/MoneyInput';
import styles from './Budgets.module.css';

/** Budgets apply to active expense AND savings categories (never income /
 *  transfer). A savings budget is a target to HIT, not a spending ceiling —
 *  the month view presents them under "Saving". */
function isBudgetable(category: Category): boolean {
  return (
    category.active !== false &&
    (isExpenseGroup(category.group) || isSavingsGroup(category.group))
  );
}

function halereToString(halere: number | undefined): string {
  return halere === undefined ? '' : String(Math.round(halere / 100));
}

/** Seed the editable default/override strings from the stored budgets. */
function buildSeed(budgetable: Category[], budgets: BudgetMap, month: string) {
  const defaults: Record<string, string> = {};
  const overrides: Record<string, string> = {};
  for (const cat of budgetable) {
    defaults[cat.id] = halereToString(budgets[cat.id]?.defaultMonthlyHalere);
    overrides[cat.id] = halereToString(budgets[cat.id]?.overrides?.[month]);
  }
  return { defaults, overrides };
}

export function Budgets() {
  const categories = useDataStore((s) => s.categories);
  const budgets = useDataStore((s) => s.budgets);
  const currentMonthKey = useDataStore((s) => s.currentMonthKey);
  const saveBudgets = useDataStore((s) => s.saveBudgets);
  const saving = useDataStore((s) => s.saving);

  const [viewedMonth, setViewedMonth] = useState(currentMonthKey);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const budgetable = useMemo(() => {
    const order = new Map(CATEGORY_GROUP_ORDER.map((g, i) => [g, i]));
    return categories
      .filter(isBudgetable)
      .sort(
        (a, b) =>
          (order.get(a.group) ?? 99) - (order.get(b.group) ?? 99) || a.name.localeCompare(b.name),
      );
  }, [categories]);

  const spendingCats = budgetable.filter((c) => isExpenseGroup(c.group));
  const savingCats = budgetable.filter((c) => isSavingsGroup(c.group));

  const [defaults, setDefaults] = useState<Record<string, string>>(
    () => buildSeed(budgetable, budgets, viewedMonth).defaults,
  );
  const [overrides, setOverrides] = useState<Record<string, string>>(
    () => buildSeed(budgetable, budgets, viewedMonth).overrides,
  );

  // Reseed (during render, React's recommended pattern) when the stored budgets
  // change after a save, or the viewed month changes — overrides are per-month.
  // Unsaved edits to a previous month are intentionally dropped on month change.
  const [seed, setSeed] = useState({ budgetable, budgets, viewedMonth });
  if (
    seed.budgetable !== budgetable ||
    seed.budgets !== budgets ||
    seed.viewedMonth !== viewedMonth
  ) {
    setSeed({ budgetable, budgets, viewedMonth });
    const next = buildSeed(budgetable, budgets, viewedMonth);
    setDefaults(next.defaults);
    setOverrides(next.overrides);
  }

  async function handleSave() {
    const next: Record<string, CategoryBudget | null> = {};
    for (const cat of budgetable) {
      const existing = budgets[cat.id];
      const defaultRaw = (defaults[cat.id] ?? '').trim();
      const overrideRaw = (overrides[cat.id] ?? '').trim();
      const defaultParsed = defaultRaw === '' ? null : parseKcInput(defaultRaw);
      const overrideParsed = overrideRaw === '' ? null : parseKcInput(overrideRaw);

      // Preserve other months' overrides; set or clear this month's.
      const merged: Record<string, number> = { ...(existing?.overrides ?? {}) };
      if (overrideParsed === null) {
        delete merged[viewedMonth];
      } else {
        merged[viewedMonth] = overrideParsed;
      }
      const hasOverrides = Object.keys(merged).length > 0;

      if (defaultParsed === null && !hasOverrides) {
        // Nothing set — remove the entry if it previously existed.
        if (existing) {
          next[cat.id] = null;
        }
        continue;
      }
      // Only persist a default when one was actually entered — coercing a blank
      // default to 0 would impose a 0 Kč ceiling on every non-override month.
      const entry: CategoryBudget = {};
      if (defaultParsed !== null) {
        entry.defaultMonthlyHalere = defaultParsed;
      }
      if (hasOverrides) {
        entry.overrides = merged;
      }
      next[cat.id] = entry;
    }
    const ok = await saveBudgets(next);
    if (ok) {
      navigate('/month');
    }
  }

  return (
    <section className={styles.screen}>
      <h1 className={styles.heading}>Budgets</h1>

      <div className={styles.monthNav}>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => setViewedMonth((m) => shiftMonth(m, -1))}
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className={styles.monthLabel}>{formatMonthLabel(viewedMonth)}</span>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => setViewedMonth((m) => shiftMonth(m, 1))}
          aria-label="Next month"
        >
          ›
        </button>
      </div>
      <p className={styles.muted}>
        Set a default monthly target per category. Tap a category to override just{' '}
        {formatMonthLabel(viewedMonth)}.
      </p>

      {budgetable.length === 0 && (
        <p className={styles.muted}>
          No expense or savings categories yet. Add some in Settings first.
        </p>
      )}

      {spendingCats.length > 0 && (
        <div className={styles.group}>
          <h2 className={styles.groupHeading}>Spending</h2>
          <ul className={styles.list}>{spendingCats.map(renderCategoryRow)}</ul>
        </div>
      )}

      {savingCats.length > 0 && (
        <div className={styles.group}>
          <h2 className={styles.groupHeading}>Saving targets</h2>
          <p className={styles.muted}>
            Targets to hit, not ceilings — the month view cheers when you reach them.
          </p>
          <ul className={styles.list}>{savingCats.map(renderCategoryRow)}</ul>
        </div>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={() => void handleSave()}
          disabled={saving || budgetable.length === 0}
        >
          {saving ? 'Saving…' : 'Save budgets'}
        </button>
        <button type="button" className={styles.secondaryBtn} onClick={() => navigate('/month')}>
          Cancel
        </button>
      </div>
    </section>
  );

  function renderCategoryRow(cat: Category) {
    const isExpanded = expanded[cat.id] ?? false;
    const effective = budgetFor(budgets, cat.id, viewedMonth);
    const hasOverride = budgets[cat.id]?.overrides?.[viewedMonth] !== undefined;
    return (
      <li key={cat.id} className={styles.row}>
              <div className={styles.rowTop}>
                <span className={styles.rowText}>
                  <span className={styles.name}>{cat.name}</span>
                  <span className={styles.groupLabel}>{CATEGORY_GROUP_LABELS[cat.group]}</span>
                </span>
                <div className={styles.defaultField}>
                  <MoneyInput
                    id={`bud-${cat.id}`}
                    label="Default / month"
                    value={defaults[cat.id] ?? ''}
                    onChange={(v) => setDefaults((prev) => ({ ...prev, [cat.id]: v }))}
                    allowEmpty
                  />
                </div>
              </div>

              <button
                type="button"
                className={styles.overrideToggle}
                onClick={() => setExpanded((prev) => ({ ...prev, [cat.id]: !isExpanded }))}
                aria-expanded={isExpanded}
              >
                {hasOverride
                  ? `Override set for ${formatMonthLabel(viewedMonth)}`
                  : `Override ${formatMonthLabel(viewedMonth)}`}
              </button>

              {isExpanded && (
                <div className={styles.overrideBox}>
                  <MoneyInput
                    id={`ovr-${cat.id}`}
                    label={`Target for ${formatMonthLabel(viewedMonth)}`}
                    value={overrides[cat.id] ?? ''}
                    onChange={(v) => setOverrides((prev) => ({ ...prev, [cat.id]: v }))}
                    hint={
                      effective !== null
                        ? 'Leave blank to fall back to the default.'
                        : 'No default set — this month only.'
                    }
                    allowEmpty
                  />
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    onClick={() => setOverrides((prev) => ({ ...prev, [cat.id]: '' }))}
                  >
                    Clear override
                  </button>
                </div>
              )}
      </li>
    );
  }
}
