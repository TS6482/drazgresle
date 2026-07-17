import { useEffect, useRef, useState } from 'react';
import { navigate, useHashRoute } from '../router/useHashRoute';
import { useMenuStore } from '../store/menu';
import styles from './MoreMenu.module.css';

/**
 * Floating Liquid-Glass ⋯ button that opens a small iOS-style popover menu. The
 * first item is always "Settings"; below it appear any actions the current
 * screen registered via useMenuStore. Hidden on Settings itself (no-op there).
 */
export function MoreMenu() {
  const route = useHashRoute();
  const actions = useMenuStore((s) => s.actions);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  // Close whenever the route changes (navigating away dismisses the menu). Done
  // as a render-phase reset — React's endorsed "adjust state when a value
  // changes" pattern — rather than a setState-in-effect.
  const [seenRoute, setSeenRoute] = useState(route);
  if (seenRoute !== route) {
    setSeenRoute(route);
    setOpen(false);
  }

  // On open, move focus to the first menu item.
  useEffect(() => {
    if (open) {
      firstItemRef.current?.focus();
    }
  }, [open]);

  if (route === '/settings') {
    return null;
  }

  const close = () => setOpen(false);

  // Run an item's action, then close.
  const select = (run: () => void) => {
    run();
    setOpen(false);
  };

  // Escape closes and returns focus to the trigger.
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        className={styles.moreButton}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu"
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {open && (
        <>
          {/* Transparent full-viewport backdrop: an outside tap closes the menu. */}
          <div className={styles.backdrop} onPointerDown={close} />
          <div className={styles.popover} role="menu" onKeyDown={handleKeyDown}>
            <button
              ref={firstItemRef}
              type="button"
              role="menuitem"
              className={styles.item}
              onClick={() => select(() => navigate('/settings'))}
            >
              Settings
            </button>
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                role="menuitem"
                className={styles.item}
                onClick={() => select(action.run)}
              >
                {action.label}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
