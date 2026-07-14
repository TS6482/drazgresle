import { create } from 'zustand';
import {
  DATA_REPO_NAME,
  DATA_REPO_OWNER,
  TOKEN_STORAGE_KEY,
} from '../config';
import {
  GithubAuthError,
  GithubError,
  createGithubClient,
} from '../api/github';

export type SessionStatus = 'idle' | 'validating' | 'connected' | 'error';

interface SessionState {
  /** The validated token, or null when not connected. */
  token: string | null;
  /** GitHub username of the connected account. */
  username: string | null;
  status: SessionStatus;
  /** Plain-language error message for the token screen, or null. */
  error: string | null;
  /** True once a write is rejected as unauthorized — the app goes read-only. */
  readOnly: boolean;

  /** Validate a freshly entered token and, on success, connect. */
  connect: (rawToken: string) => Promise<void>;
  /** Revalidate a token cached from an earlier tab session, if any. */
  restore: () => Promise<void>;
  /** Forget the token and return to the entry screen. */
  disconnect: () => void;
  /** Called by data writes; flips to read-only on 401/403. */
  reportWriteFailure: (status: number) => void;
}

function readStoredToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // sessionStorage can be unavailable (private mode, disabled cookies).
    // The in-memory token still works for the current session.
  }
}

function clearStoredToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function describeError(err: unknown): string {
  if (err instanceof GithubAuthError) {
    return 'GitHub did not accept this token. Check that you pasted it in full and that it has not expired.';
  }
  if (err instanceof GithubError) {
    return `GitHub returned an unexpected error (status ${err.status}). Please try again in a moment.`;
  }
  return 'Could not reach GitHub. Check your internet connection and try again.';
}

async function validateAndConnect(
  set: (partial: Partial<SessionState>) => void,
  rawToken: string,
): Promise<void> {
  const token = rawToken.trim();
  if (token === '') {
    set({ status: 'error', error: 'Please paste your access token first.' });
    return;
  }

  set({ status: 'validating', error: null });
  const client = createGithubClient({
    owner: DATA_REPO_OWNER,
    repo: DATA_REPO_NAME,
    token,
  });

  try {
    const user = await client.getAuthenticatedUser();
    const repo = await client.getRepo();

    if (!repo) {
      clearStoredToken();
      set({
        status: 'error',
        token: null,
        username: null,
        error: `This token works, but it cannot see the data repository "${DATA_REPO_OWNER}/${DATA_REPO_NAME}". Make sure the token is allowed to access that repository.`,
      });
      return;
    }

    if (!repo.canPush) {
      clearStoredToken();
      set({
        status: 'error',
        token: null,
        username: null,
        error: 'This token can read the data repository but cannot write to it. It needs "Contents: Read and write" permission.',
      });
      return;
    }

    storeToken(token);
    set({
      token,
      username: user.login,
      status: 'connected',
      error: null,
      readOnly: false,
    });
  } catch (err) {
    clearStoredToken();
    set({
      status: 'error',
      token: null,
      username: null,
      error: describeError(err),
    });
  }
}

export const useSessionStore = create<SessionState>((set, get) => ({
  token: null,
  username: null,
  // Show a "connecting" state on first load if a token is already cached,
  // so we don't flash the entry screen before revalidating it.
  status: readStoredToken() ? 'validating' : 'idle',
  error: null,
  readOnly: false,

  connect: (rawToken) => validateAndConnect(set, rawToken),

  restore: async () => {
    const token = readStoredToken();
    if (!token) {
      set({ status: 'idle' });
      return;
    }
    await get().connect(token);
  },

  disconnect: () => {
    clearStoredToken();
    set({
      token: null,
      username: null,
      status: 'idle',
      error: null,
      readOnly: false,
    });
  },

  reportWriteFailure: (status) => {
    if (status === 401 || status === 403) {
      set({ readOnly: true });
    }
  },
}));
