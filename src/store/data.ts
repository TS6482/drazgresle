import { create } from 'zustand';
import { DATA_REPO_NAME, DATA_REPO_OWNER } from '../config';
import {
  GithubAuthError,
  GithubError,
  createGithubClient,
} from '../api/github';
import type { GithubClient } from '../api/github';
import { useSessionStore } from './session';
import { monthKey } from '../engine/summarize';
import { todayIso } from '../utils/dates';
import type {
  Account,
  AccountsFile,
  BudgetsFile,
  CategoriesFile,
  Category,
  CategoryBudget,
  IsoDate,
  MonthFile,
  Person,
  Rule,
  RulesFile,
  SettingsFile,
  Snapshot,
  SnapshotsFile,
  StatementMeta,
  Transaction,
} from '../types/data';

// Paths inside the private data repo (see docs/ARCHITECTURE.md §4). The seeded
// files exist with empty shapes, so a normal load finds them; we still tolerate
// a 404 by treating the file as empty. Transaction files are sharded per month.
const ACCOUNTS_PATH = 'data/accounts.json';
const SNAPSHOTS_PATH = 'data/snapshots.json';
const CATEGORIES_PATH = 'data/categories.json';
const BUDGETS_PATH = 'data/budgets.json';
const SETTINGS_PATH = 'data/settings.json';
const RULES_PATH = 'data/rules.json';

function monthPath(month: string): string {
  return `data/transactions/${month}.json`;
}

/** Any of the JSON files this store reads/writes. */
type DataFile =
  | AccountsFile
  | SnapshotsFile
  | CategoriesFile
  | BudgetsFile
  | SettingsFile
  | RulesFile
  | MonthFile;

/** True when two statement-metadata entries describe the same statement. */
function sameStatement(a: StatementMeta, b: StatementMeta): boolean {
  return (
    a.accountNumber === b.accountNumber &&
    a.periodStart === b.periodStart &&
    a.periodEnd === b.periodEnd
  );
}

/** Build a MonthFile, attaching `statements` only when there are any. */
function buildMonthFile(transactions: Transaction[], statements: StatementMeta[]): MonthFile {
  const file: MonthFile = { schemaVersion: 1, transactions: sortTransactions(transactions) };
  if (statements.length > 0) {
    file.statements = statements;
  }
  return file;
}

/**
 * The statement metadata with the latest period end across every loaded month,
 * optionally restricted to one account number. Drives the Air Bank auto-balance
 * (docs/ARCHITECTURE.md §4).
 */
export function latestStatementMeta(
  monthStatements: Record<string, StatementMeta[]>,
  accountNumber?: string,
): StatementMeta | null {
  let latest: StatementMeta | null = null;
  for (const list of Object.values(monthStatements)) {
    for (const meta of list) {
      if (accountNumber !== undefined && meta.accountNumber !== accountNumber) {
        continue;
      }
      if (latest === null || meta.periodEnd > latest.periodEnd) {
        latest = meta;
      }
    }
  }
  return latest;
}

function sortSnapshots(snapshots: Snapshot[]): Snapshot[] {
  return [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
}

/** Transactions kept sorted by date then id, so lists render deterministically. */
function sortTransactions(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
}

/** Build a client from the current session token, or null if not connected. */
function activeClient(): GithubClient | null {
  const token = useSessionStore.getState().token;
  if (!token) {
    return null;
  }
  return createGithubClient({
    owner: DATA_REPO_OWNER,
    repo: DATA_REPO_NAME,
    token,
  });
}

// --- structured merge builders (re-applied on top of the fresh file on 409) ---

/** Upsert each given account by id onto the current file, keeping others. */
function mergeAccounts(next: Account[]) {
  return (current: AccountsFile | null): AccountsFile => {
    const byId = new Map<string, Account>(
      (current?.accounts ?? []).map((a) => [a.id, a]),
    );
    for (const account of next) {
      byId.set(account.id, account);
    }
    return { schemaVersion: 1, accounts: [...byId.values()] };
  };
}

/** Upsert one snapshot by date onto the current file, kept sorted. */
function mergeSnapshot(snapshot: Snapshot) {
  return (current: SnapshotsFile | null): SnapshotsFile => {
    const others = (current?.snapshots ?? []).filter((s) => s.date !== snapshot.date);
    return { schemaVersion: 1, snapshots: sortSnapshots([...others, snapshot]) };
  };
}

/** Remove the snapshot with `date` from the current file, kept sorted. */
function mergeDeleteSnapshot(date: IsoDate) {
  return (current: SnapshotsFile | null): SnapshotsFile => ({
    schemaVersion: 1,
    snapshots: sortSnapshots((current?.snapshots ?? []).filter((s) => s.date !== date)),
  });
}

/** Upsert each given category by id onto the current file, keeping others. */
function mergeCategories(next: Category[]) {
  return (current: CategoriesFile | null): CategoriesFile => {
    const byId = new Map<string, Category>(
      (current?.categories ?? []).map((c) => [c.id, c]),
    );
    for (const category of next) {
      byId.set(category.id, category);
    }
    return { schemaVersion: 1, categories: [...byId.values()] };
  };
}

/**
 * Overlay per-category budget entries. A `null` value removes that category's
 * budget; any other value replaces it. Other categories survive untouched.
 */
function mergeBudgets(next: Record<string, CategoryBudget | null>) {
  return (current: BudgetsFile | null): BudgetsFile => {
    const budgets: Record<string, CategoryBudget> = { ...(current?.budgets ?? {}) };
    for (const [id, entry] of Object.entries(next)) {
      if (entry === null) {
        delete budgets[id];
      } else {
        budgets[id] = entry;
      }
    }
    return { schemaVersion: 1, budgets };
  };
}

/** Replace the settings file wholesale (rarely edited concurrently). */
function mergeSettings(settings: SettingsFile) {
  return (): SettingsFile => settings;
}

/** Upsert one transaction by id into its month file, preserving statements. */
function mergeTransaction(transaction: Transaction) {
  return (current: MonthFile | null): MonthFile => {
    const others = (current?.transactions ?? []).filter((t) => t.id !== transaction.id);
    return buildMonthFile([...others, transaction], current?.statements ?? []);
  };
}

/** Upsert many transactions by id in one write, preserving statements. */
function mergeTransactions(next: Transaction[]) {
  return (current: MonthFile | null): MonthFile => {
    const byId = new Map<string, Transaction>(
      (current?.transactions ?? []).map((t) => [t.id, t]),
    );
    for (const tx of next) {
      byId.set(tx.id, tx);
    }
    return buildMonthFile([...byId.values()], current?.statements ?? []);
  };
}

/** Remove the transaction with `id` from its month file, preserving statements. */
function mergeDeleteTransaction(id: string) {
  return (current: MonthFile | null): MonthFile =>
    buildMonthFile(
      (current?.transactions ?? []).filter((t) => t.id !== id),
      current?.statements ?? [],
    );
}

/**
 * Merge an imported statement into a month file: append transactions whose
 * importHash is not already present (existing rows are preserved untouched) and
 * append the statement metadata if that statement is not already recorded.
 */
function mergeImport(add: Transaction[], statement: StatementMeta | undefined) {
  return (current: MonthFile | null): MonthFile => {
    const existing = current?.transactions ?? [];
    const seen = new Set(
      existing.map((t) => t.importHash).filter((h): h is string => h !== undefined),
    );
    const merged = [...existing];
    for (const tx of add) {
      if (tx.importHash !== undefined && seen.has(tx.importHash)) {
        continue;
      }
      merged.push(tx);
      if (tx.importHash !== undefined) {
        seen.add(tx.importHash);
      }
    }
    const statements = [...(current?.statements ?? [])];
    if (statement && !statements.some((s) => sameStatement(s, statement))) {
      statements.push(statement);
    }
    return buildMonthFile(merged, statements);
  };
}

/** Upsert each given rule by id onto the current rules file, keeping others. */
function mergeRules(next: Rule[]) {
  return (current: RulesFile | null): RulesFile => {
    const byId = new Map<string, Rule>((current?.rules ?? []).map((r) => [r.id, r]));
    for (const rule of next) {
      byId.set(rule.id, rule);
    }
    return { schemaVersion: 1, rules: [...byId.values()] };
  };
}

function describeError(err: unknown): string {
  if (err instanceof GithubAuthError) {
    return 'GitHub rejected the request (your token may have expired). Reconnect to continue.';
  }
  if (err instanceof GithubError) {
    return `GitHub returned an unexpected error (status ${err.status}). Please try again.`;
  }
  return 'Could not reach GitHub. Check your connection and try again.';
}

interface DataState {
  accounts: Account[];
  snapshots: Snapshot[];
  categories: Category[];
  budgets: Record<string, CategoryBudget>;
  rules: Rule[];
  persons: Person[];
  projectionDefaults: Record<string, number>;
  /** Cache of loaded month files' transactions, keyed by `'YYYY-MM'`. */
  months: Record<string, Transaction[]>;
  /** Cache of loaded month files' statement metadata, keyed by `'YYYY-MM'`. */
  monthStatements: Record<string, StatementMeta[]>;
  /** `'YYYY-MM'` for today, resolved at load time. */
  currentMonthKey: string;

  accountsSha: string | null;
  snapshotsSha: string | null;
  categoriesSha: string | null;
  budgetsSha: string | null;
  settingsSha: string | null;
  rulesSha: string | null;
  monthShas: Record<string, string | null>;
  monthsLoaded: Record<string, boolean>;

  loading: boolean;
  loaded: boolean;
  saving: boolean;
  error: string | null;

  /** Fetch every top-level file + the current month. Called once on connect. */
  load: () => Promise<void>;
  /** Load a specific month's transactions on demand (cached). */
  loadMonth: (month: string) => Promise<void>;
  /** Upsert-by-id the given accounts and persist. Returns false on failure. */
  saveAccounts: (accounts: Account[]) => Promise<boolean>;
  /** Upsert one snapshot by date and persist. Returns false on failure. */
  saveSnapshot: (snapshot: Snapshot) => Promise<boolean>;
  /** Delete the snapshot with the given date and persist. */
  deleteSnapshot: (date: IsoDate) => Promise<boolean>;
  /** Upsert-by-id the given categories and persist. */
  saveCategories: (categories: Category[]) => Promise<boolean>;
  /** Overlay per-category budgets (null removes a category) and persist. */
  saveBudgets: (next: Record<string, CategoryBudget | null>) => Promise<boolean>;
  /** Persist household settings (persons + projection defaults). */
  saveSettings: (persons: Person[], projectionDefaults: Record<string, number>) => Promise<boolean>;
  /** Upsert one transaction into its month file (derived from its date). */
  saveTransaction: (transaction: Transaction) => Promise<boolean>;
  /** Remove a transaction by id from the given month. */
  deleteTransaction: (month: string, id: string) => Promise<boolean>;
  /** Upsert many transactions into one month file in a single write (e.g. the
   *  "auto-classify unclassified" retroactive re-apply). */
  saveTransactions: (month: string, transactions: Transaction[]) => Promise<boolean>;
  /** Upsert-by-id the given rules and persist. */
  saveRules: (rules: Rule[]) => Promise<boolean>;
  /**
   * Commit an import: for each `'YYYY-MM'`, append its new-by-hash transactions
   * and (optionally) its statement metadata to that month file. Each month is a
   * separate structured-merge write. Returns false if any month fails.
   */
  saveImport: (
    perMonth: Record<string, { transactions: Transaction[]; statement?: StatementMeta }>,
  ) => Promise<boolean>;
  /** Clear all cached data (on disconnect). */
  reset: () => void;
}

const EMPTY_STATE = {
  accounts: [] as Account[],
  snapshots: [] as Snapshot[],
  categories: [] as Category[],
  budgets: {} as Record<string, CategoryBudget>,
  rules: [] as Rule[],
  persons: [] as Person[],
  projectionDefaults: {} as Record<string, number>,
  months: {} as Record<string, Transaction[]>,
  monthStatements: {} as Record<string, StatementMeta[]>,
  currentMonthKey: monthKey(todayIso()),
  accountsSha: null,
  snapshotsSha: null,
  categoriesSha: null,
  budgetsSha: null,
  settingsSha: null,
  rulesSha: null,
  monthShas: {} as Record<string, string | null>,
  monthsLoaded: {} as Record<string, boolean>,
  loading: false,
  loaded: false,
  saving: false,
  error: null,
};

export const useDataStore = create<DataState>((set, get) => {
  /** Shared write path: PUT with a structured merge, mapping failures to state. */
  async function write<T extends DataFile>(
    path: string,
    sha: string | null,
    localCurrent: T,
    merge: (current: T | null) => T,
    message: string,
  ): Promise<{ data: T; sha: string } | null> {
    const client = activeClient();
    if (!client) {
      set({ error: 'Not connected to GitHub.' });
      return null;
    }
    set({ saving: true, error: null });
    try {
      const result = await client.putJsonFile<T>(
        path,
        merge(localCurrent),
        sha,
        message,
        merge,
      );
      set({ saving: false });
      return result;
    } catch (err) {
      if (err instanceof GithubAuthError) {
        useSessionStore.getState().reportWriteFailure(err.status);
      }
      set({ saving: false, error: describeError(err) });
      return null;
    }
  }

  return {
    ...EMPTY_STATE,

    load: async () => {
      const client = activeClient();
      if (!client) {
        return;
      }
      const mk = monthKey(todayIso());
      set({ loading: true, error: null });
      try {
        const [accountsFile, snapshotsFile, categoriesFile, budgetsFile, settingsFile, rulesFile, monthFile] =
          await Promise.all([
            client.getJsonFile<AccountsFile>(ACCOUNTS_PATH),
            client.getJsonFile<SnapshotsFile>(SNAPSHOTS_PATH),
            client.getJsonFile<CategoriesFile>(CATEGORIES_PATH),
            client.getJsonFile<BudgetsFile>(BUDGETS_PATH),
            client.getJsonFile<SettingsFile>(SETTINGS_PATH),
            client.getJsonFile<RulesFile>(RULES_PATH),
            client.getJsonFile<MonthFile>(monthPath(mk)),
          ]);
        set({
          accounts: accountsFile?.data.accounts ?? [],
          accountsSha: accountsFile?.sha ?? null,
          snapshots: sortSnapshots(snapshotsFile?.data.snapshots ?? []),
          snapshotsSha: snapshotsFile?.sha ?? null,
          categories: categoriesFile?.data.categories ?? [],
          categoriesSha: categoriesFile?.sha ?? null,
          budgets: budgetsFile?.data.budgets ?? {},
          budgetsSha: budgetsFile?.sha ?? null,
          persons: settingsFile?.data.persons ?? [],
          projectionDefaults: settingsFile?.data.projectionDefaults ?? {},
          settingsSha: settingsFile?.sha ?? null,
          rules: rulesFile?.data.rules ?? [],
          rulesSha: rulesFile?.sha ?? null,
          currentMonthKey: mk,
          months: { [mk]: sortTransactions(monthFile?.data.transactions ?? []) },
          monthStatements: { [mk]: monthFile?.data.statements ?? [] },
          monthShas: { [mk]: monthFile?.sha ?? null },
          monthsLoaded: { [mk]: true },
          loading: false,
          loaded: true,
        });
      } catch (err) {
        set({ loading: false, error: describeError(err) });
      }
    },

    loadMonth: async (month) => {
      if (get().monthsLoaded[month]) {
        return;
      }
      const client = activeClient();
      if (!client) {
        return;
      }
      try {
        const file = await client.getJsonFile<MonthFile>(monthPath(month));
        set((state) => ({
          months: { ...state.months, [month]: sortTransactions(file?.data.transactions ?? []) },
          monthStatements: { ...state.monthStatements, [month]: file?.data.statements ?? [] },
          monthShas: { ...state.monthShas, [month]: file?.sha ?? null },
          monthsLoaded: { ...state.monthsLoaded, [month]: true },
        }));
      } catch (err) {
        set({ error: describeError(err) });
      }
    },

    saveAccounts: async (next) => {
      const localCurrent: AccountsFile = { schemaVersion: 1, accounts: get().accounts };
      const result = await write(
        ACCOUNTS_PATH,
        get().accountsSha,
        localCurrent,
        mergeAccounts(next),
        'Update accounts',
      );
      if (!result) {
        return false;
      }
      set({ accounts: result.data.accounts, accountsSha: result.sha });
      return true;
    },

    saveSnapshot: async (snapshot) => {
      const localCurrent: SnapshotsFile = { schemaVersion: 1, snapshots: get().snapshots };
      const result = await write(
        SNAPSHOTS_PATH,
        get().snapshotsSha,
        localCurrent,
        mergeSnapshot(snapshot),
        `Save snapshot ${snapshot.date}`,
      );
      if (!result) {
        return false;
      }
      set({ snapshots: result.data.snapshots, snapshotsSha: result.sha });
      return true;
    },

    deleteSnapshot: async (date) => {
      const localCurrent: SnapshotsFile = { schemaVersion: 1, snapshots: get().snapshots };
      const result = await write(
        SNAPSHOTS_PATH,
        get().snapshotsSha,
        localCurrent,
        mergeDeleteSnapshot(date),
        `Delete snapshot ${date}`,
      );
      if (!result) {
        return false;
      }
      set({ snapshots: result.data.snapshots, snapshotsSha: result.sha });
      return true;
    },

    saveCategories: async (next) => {
      const localCurrent: CategoriesFile = { schemaVersion: 1, categories: get().categories };
      const result = await write(
        CATEGORIES_PATH,
        get().categoriesSha,
        localCurrent,
        mergeCategories(next),
        'Update categories',
      );
      if (!result) {
        return false;
      }
      set({ categories: result.data.categories, categoriesSha: result.sha });
      return true;
    },

    saveBudgets: async (next) => {
      const localCurrent: BudgetsFile = { schemaVersion: 1, budgets: get().budgets };
      const result = await write(
        BUDGETS_PATH,
        get().budgetsSha,
        localCurrent,
        mergeBudgets(next),
        'Update budgets',
      );
      if (!result) {
        return false;
      }
      set({ budgets: result.data.budgets, budgetsSha: result.sha });
      return true;
    },

    saveSettings: async (persons, projectionDefaults) => {
      const settings: SettingsFile = { schemaVersion: 1, persons, projectionDefaults };
      const result = await write(
        SETTINGS_PATH,
        get().settingsSha,
        settings,
        mergeSettings(settings),
        'Update settings',
      );
      if (!result) {
        return false;
      }
      set({
        persons: result.data.persons,
        projectionDefaults: result.data.projectionDefaults,
        settingsSha: result.sha,
      });
      return true;
    },

    saveTransaction: async (transaction) => {
      const mk = monthKey(transaction.date);
      // Existing month files must PUT with their sha; load the month first so we
      // hold it (a first-write month simply has a null sha and gets created).
      if (!get().monthsLoaded[mk]) {
        await get().loadMonth(mk);
      }
      const localCurrent = buildMonthFile(
        get().months[mk] ?? [],
        get().monthStatements[mk] ?? [],
      );
      const result = await write(
        monthPath(mk),
        get().monthShas[mk] ?? null,
        localCurrent,
        mergeTransaction(transaction),
        `Save transaction ${transaction.date}`,
      );
      if (!result) {
        return false;
      }
      set((state) => ({
        months: { ...state.months, [mk]: result.data.transactions },
        monthStatements: { ...state.monthStatements, [mk]: result.data.statements ?? [] },
        monthShas: { ...state.monthShas, [mk]: result.sha },
        monthsLoaded: { ...state.monthsLoaded, [mk]: true },
      }));
      return true;
    },

    deleteTransaction: async (month, id) => {
      if (!get().monthsLoaded[month]) {
        await get().loadMonth(month);
      }
      const localCurrent = buildMonthFile(
        get().months[month] ?? [],
        get().monthStatements[month] ?? [],
      );
      const result = await write(
        monthPath(month),
        get().monthShas[month] ?? null,
        localCurrent,
        mergeDeleteTransaction(id),
        `Delete transaction ${id}`,
      );
      if (!result) {
        return false;
      }
      set((state) => ({
        months: { ...state.months, [month]: result.data.transactions },
        monthStatements: { ...state.monthStatements, [month]: result.data.statements ?? [] },
        monthShas: { ...state.monthShas, [month]: result.sha },
        monthsLoaded: { ...state.monthsLoaded, [month]: true },
      }));
      return true;
    },

    saveTransactions: async (month, next) => {
      if (next.length === 0) {
        return true;
      }
      if (!get().monthsLoaded[month]) {
        await get().loadMonth(month);
      }
      const localCurrent = buildMonthFile(
        get().months[month] ?? [],
        get().monthStatements[month] ?? [],
      );
      const result = await write(
        monthPath(month),
        get().monthShas[month] ?? null,
        localCurrent,
        mergeTransactions(next),
        `Update ${next.length} transactions in ${month}`,
      );
      if (!result) {
        return false;
      }
      set((state) => ({
        months: { ...state.months, [month]: result.data.transactions },
        monthStatements: { ...state.monthStatements, [month]: result.data.statements ?? [] },
        monthShas: { ...state.monthShas, [month]: result.sha },
        monthsLoaded: { ...state.monthsLoaded, [month]: true },
      }));
      return true;
    },

    saveRules: async (next) => {
      const localCurrent: RulesFile = { schemaVersion: 1, rules: get().rules };
      const result = await write(
        RULES_PATH,
        get().rulesSha,
        localCurrent,
        mergeRules(next),
        'Update classification rules',
      );
      if (!result) {
        return false;
      }
      set({ rules: result.data.rules, rulesSha: result.sha });
      return true;
    },

    saveImport: async (perMonth) => {
      for (const [mk, payload] of Object.entries(perMonth)) {
        if (!get().monthsLoaded[mk]) {
          await get().loadMonth(mk);
        }
        const localCurrent = buildMonthFile(
          get().months[mk] ?? [],
          get().monthStatements[mk] ?? [],
        );
        const result = await write(
          monthPath(mk),
          get().monthShas[mk] ?? null,
          localCurrent,
          mergeImport(payload.transactions, payload.statement),
          `Import statement into ${mk}`,
        );
        if (!result) {
          return false;
        }
        set((state) => ({
          months: { ...state.months, [mk]: result.data.transactions },
          monthStatements: { ...state.monthStatements, [mk]: result.data.statements ?? [] },
          monthShas: { ...state.monthShas, [mk]: result.sha },
          monthsLoaded: { ...state.monthsLoaded, [mk]: true },
        }));
      }
      return true;
    },

    reset: () => {
      set({ ...EMPTY_STATE, currentMonthKey: monthKey(todayIso()) });
    },
  };
});
