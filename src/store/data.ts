import { create } from 'zustand';
import { DATA_REPO_NAME, DATA_REPO_OWNER } from '../config';
import {
  GithubAuthError,
  GithubError,
  createGithubClient,
} from '../api/github';
import type { GithubClient } from '../api/github';
import { useSessionStore } from './session';
import type {
  Account,
  AccountsFile,
  IsoDate,
  Snapshot,
  SnapshotsFile,
} from '../types/data';

// Paths inside the private data repo (see docs/ARCHITECTURE.md §4). Both files are
// seeded in the repo with empty arrays, so a normal load finds them; we still
// tolerate a 404 by treating the file as empty.
const ACCOUNTS_PATH = 'data/accounts.json';
const SNAPSHOTS_PATH = 'data/snapshots.json';

function sortSnapshots(snapshots: Snapshot[]): Snapshot[] {
  return [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
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
  accountsSha: string | null;
  snapshotsSha: string | null;
  loading: boolean;
  loaded: boolean;
  saving: boolean;
  error: string | null;

  /** Fetch both files. Called once after the session connects. */
  load: () => Promise<void>;
  /** Upsert-by-id the given accounts and persist. Returns false on failure. */
  saveAccounts: (accounts: Account[]) => Promise<boolean>;
  /** Upsert one snapshot by date and persist. Returns false on failure. */
  saveSnapshot: (snapshot: Snapshot) => Promise<boolean>;
  /** Delete the snapshot with the given date and persist. */
  deleteSnapshot: (date: IsoDate) => Promise<boolean>;
  /** Clear all cached data (on disconnect). */
  reset: () => void;
}

export const useDataStore = create<DataState>((set, get) => {
  /** Shared write path: PUT with a structured merge, mapping failures to state. */
  async function write<T extends AccountsFile | SnapshotsFile>(
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
    accounts: [],
    snapshots: [],
    accountsSha: null,
    snapshotsSha: null,
    loading: false,
    loaded: false,
    saving: false,
    error: null,

    load: async () => {
      const client = activeClient();
      if (!client) {
        return;
      }
      set({ loading: true, error: null });
      try {
        const [accountsFile, snapshotsFile] = await Promise.all([
          client.getJsonFile<AccountsFile>(ACCOUNTS_PATH),
          client.getJsonFile<SnapshotsFile>(SNAPSHOTS_PATH),
        ]);
        set({
          accounts: accountsFile?.data.accounts ?? [],
          accountsSha: accountsFile?.sha ?? null,
          snapshots: sortSnapshots(snapshotsFile?.data.snapshots ?? []),
          snapshotsSha: snapshotsFile?.sha ?? null,
          loading: false,
          loaded: true,
        });
      } catch (err) {
        set({ loading: false, error: describeError(err) });
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

    reset: () => {
      set({
        accounts: [],
        snapshots: [],
        accountsSha: null,
        snapshotsSha: null,
        loading: false,
        loaded: false,
        saving: false,
        error: null,
      });
    },
  };
});
