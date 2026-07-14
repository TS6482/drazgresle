import { useState } from 'react';
import type { FormEvent } from 'react';
import { useSessionStore } from '../../store/session';
import { DATA_REPO_NAME, DATA_REPO_OWNER } from '../../config';
import styles from './TokenEntry.module.css';

export function TokenEntry() {
  const status = useSessionStore((s) => s.status);
  const error = useSessionStore((s) => s.error);
  const connect = useSessionStore((s) => s.connect);
  const [token, setToken] = useState('');

  const busy = status === 'validating';

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void connect(token);
  }

  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>Dražgrešle</h1>
      <p className={styles.lead}>
        Connect your GitHub access token to open the household&apos;s financial data.
      </p>

      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.label} htmlFor="token">
          Personal access token
        </label>
        <input
          id="token"
          className={styles.input}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="github_pat_…"
          disabled={busy}
        />
        <button
          className={styles.button}
          type="submit"
          disabled={busy || token.trim() === ''}
        >
          {busy ? 'Checking…' : 'Connect'}
        </button>
      </form>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <p className={styles.hint}>
        The token stays in this browser tab only and is sent only to GitHub. It needs
        read &amp; write access to the private repository{' '}
        <code>
          {DATA_REPO_OWNER}/{DATA_REPO_NAME}
        </code>
        .
      </p>
    </div>
  );
}
