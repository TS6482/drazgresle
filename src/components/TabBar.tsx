import { navigate } from '../router/useHashRoute';
import styles from './TabBar.module.css';

interface Tab {
  route: string;
  label: string;
  icon: string;
}

const TABS: Tab[] = [
  { route: '/', label: 'Home', icon: '⌂' },
  { route: '/month', label: 'Month', icon: '🧾' },
  { route: '/networth', label: 'Net worth', icon: '📈' },
  { route: '/accounts', label: 'Accounts', icon: '≣' },
];

interface TabBarProps {
  route: string;
}

/** Phone-first bottom navigation. Each target is at least 44px tall. */
export function TabBar({ route }: TabBarProps) {
  return (
    <nav className={styles.bar} aria-label="Main">
      {TABS.map((tab) => {
        const active = tab.route === route || (tab.route !== '/' && route.startsWith(tab.route));
        return (
          <button
            key={tab.route}
            type="button"
            className={`${styles.tab} ${active ? styles.active : ''}`}
            aria-current={active ? 'page' : undefined}
            onClick={() => navigate(tab.route)}
          >
            <span className={styles.icon} aria-hidden="true">
              {tab.icon}
            </span>
            <span className={styles.label}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
