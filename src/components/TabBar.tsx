import { navigate } from '../router/useHashRoute';
import { ICON_LIBRARY } from '../features/shared/icons/glyphs';
import styles from './TabBar.module.css';

/** Glyphs by id, so each tab renders the app's own monochrome line icon
 *  (currentColor → grey when inactive, indigo when active). */
const GLYPH_BY_ID = new Map(ICON_LIBRARY.map((g) => [g.id, g] as const));

interface Tab {
  route: string;
  label: string;
  /** An ICON_LIBRARY glyph id. */
  icon: string;
}

const TABS: Tab[] = [
  { route: '/', label: 'Home', icon: 'house' },
  { route: '/month', label: 'Month', icon: 'banknote' },
  { route: '/networth', label: 'Net worth', icon: 'chart-uptrend' },
  { route: '/accounts', label: 'Accounts', icon: 'building' },
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
        const Glyph = GLYPH_BY_ID.get(tab.icon)?.Svg;
        return (
          <button
            key={tab.route}
            type="button"
            className={`${styles.tab} ${active ? styles.active : ''}`}
            aria-current={active ? 'page' : undefined}
            onClick={() => navigate(tab.route)}
          >
            <span className={styles.icon} aria-hidden="true">
              {Glyph && <Glyph size={24} />}
            </span>
            <span className={styles.label}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
