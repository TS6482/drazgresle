import { useSessionStore } from '../../store/session';
import { navigate } from '../../router/useHashRoute';
import styles from './Home.module.css';

export function Home() {
  const username = useSessionStore((s) => s.username);

  return (
    <section className={styles.home}>
      <h1 className={styles.heading}>You&apos;re connected</h1>
      <p className={styles.text}>
        Signed in to GitHub as <strong>{username}</strong>. The app scaffold is ready —
        spending, net worth, projections, and the tax calendar arrive in the next phases.
      </p>
      <button
        className={styles.navButton}
        type="button"
        onClick={() => navigate('/networth')}
      >
        Open net worth (placeholder)
      </button>
    </section>
  );
}
