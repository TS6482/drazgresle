import { useEffect } from 'react';
import { useSessionStore } from './store/session';
import { useHashRoute } from './router/useHashRoute';
import { TokenEntry } from './features/auth/TokenEntry';
import { Home } from './features/home/Home';
import { NetWorthPlaceholder } from './features/networth/NetWorthPlaceholder';
import { ReadOnlyBanner } from './components/ReadOnlyBanner';
import shell from './styles/app.module.css';

export function App() {
  const status = useSessionStore((s) => s.status);
  const restore = useSessionStore((s) => s.restore);

  // On first load, revalidate any token cached in this tab.
  useEffect(() => {
    void restore();
  }, [restore]);

  if (status === 'connected') {
    return <ConnectedApp />;
  }
  if (status === 'validating') {
    return <div className={shell.loading}>Connecting to GitHub…</div>;
  }
  return <TokenEntry />;
}

function ConnectedApp() {
  const route = useHashRoute();
  const username = useSessionStore((s) => s.username);
  const disconnect = useSessionStore((s) => s.disconnect);
  const readOnly = useSessionStore((s) => s.readOnly);

  return (
    <div className={shell.app}>
      <header className={shell.header}>
        <span className={shell.brand}>Dražgrešle</span>
        <div className={shell.headerRight}>
          {username && <span className={shell.user}>{username}</span>}
          <button className={shell.linkButton} type="button" onClick={disconnect}>
            Disconnect
          </button>
        </div>
      </header>
      {readOnly && <ReadOnlyBanner />}
      <main className={shell.content}>{renderRoute(route)}</main>
    </div>
  );
}

function renderRoute(route: string) {
  switch (route) {
    case '/networth':
      return <NetWorthPlaceholder />;
    case '/':
    default:
      return <Home />;
  }
}
