import styles from './ReadOnlyBanner.module.css';

export function ReadOnlyBanner() {
  return (
    <div className={styles.banner} role="status">
      Read-only: GitHub rejected your token (it may have expired). Saving is paused —
      disconnect and reconnect with a fresh token to make changes.
    </div>
  );
}
