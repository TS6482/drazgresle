import { useEffect } from 'react';
import { useSessionStore } from './store/session';
import { useDataStore } from './store/data';
import { navigate, useHashRoute } from './router/useHashRoute';
import { TokenEntry } from './features/auth/TokenEntry';
import { Home } from './features/home/Home';
import { NetWorth } from './features/networth/NetWorth';
import { Accounts } from './features/accounts/Accounts';
import { MonthView } from './features/transactions/MonthView';
import { AddCash } from './features/transactions/AddCash';
import { Import } from './features/import/Import';
import { Budgets } from './features/budgets/Budgets';
import { Settings } from './features/settings/Settings';
import { ReadOnlyBanner } from './components/ReadOnlyBanner';
import { TabBar } from './components/TabBar';
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

  const load = useDataStore((s) => s.load);
  const reset = useDataStore((s) => s.reset);
  const error = useDataStore((s) => s.error);

  // Load the data-repo files once the session is connected.
  useEffect(() => {
    void load();
  }, [load]);

  function handleDisconnect() {
    reset();
    disconnect();
  }

  return (
    <div className={shell.app}>
      <header className={shell.header}>
        <span className={shell.brand}>Dražgrešle</span>
        <div className={shell.headerRight}>
          {username && <span className={shell.user}>{username}</span>}
          <button
            className={shell.iconButton}
            type="button"
            aria-label="Settings"
            onClick={() => navigate('/settings')}
          >
            ⚙
          </button>
          <button className={shell.linkButton} type="button" onClick={handleDisconnect}>
            Disconnect
          </button>
        </div>
      </header>
      {readOnly && <ReadOnlyBanner />}
      {error && (
        <div className={shell.dataError} role="alert">
          {error}
        </div>
      )}
      <main className={shell.content}>{renderRoute(route)}</main>
      <TabBar route={route} />
    </div>
  );
}

function renderRoute(route: string) {
  switch (route) {
    case '/month':
      return <MonthView />;
    case '/add':
      return <AddCash />;
    case '/import':
      return <Import />;
    case '/budgets':
      return <Budgets />;
    case '/settings':
      return <Settings />;
    case '/networth':
      return <NetWorth />;
    case '/accounts':
      return <Accounts />;
    case '/':
    default:
      return <Home />;
  }
}
