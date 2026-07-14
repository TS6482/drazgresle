import { navigate } from '../../router/useHashRoute';
import styles from './NetWorthPlaceholder.module.css';

export function NetWorthPlaceholder() {
  return (
    <section className={styles.placeholder}>
      <h1 className={styles.heading}>Net worth</h1>
      <p className={styles.text}>
        Quarterly snapshots and the net-worth chart arrive in Phase 1.
      </p>
      <button
        className={styles.navButton}
        type="button"
        onClick={() => navigate('/')}
      >
        Back to home
      </button>
    </section>
  );
}
