import { useEffect, useState } from 'react';

// Hash-based routing without react-router. GitHub Pages cannot rewrite unknown
// URLs to index.html, so all navigation lives after the '#'. Routes are simple
// strings like '/' or '/networth'.

function currentRoute(): string {
  const hash = window.location.hash.replace(/^#/, '');
  if (hash === '' || hash === '/') {
    return '/';
  }
  return hash.startsWith('/') ? hash : `/${hash}`;
}

/** Returns the current route and re-renders on hash changes. */
export function useHashRoute(): string {
  const [route, setRoute] = useState<string>(() => currentRoute());

  useEffect(() => {
    const handleChange = () => setRoute(currentRoute());
    window.addEventListener('hashchange', handleChange);
    return () => window.removeEventListener('hashchange', handleChange);
  }, []);

  return route;
}

/** Navigate by updating the URL hash (triggers the hashchange listener). */
export function navigate(route: string): void {
  const normalized = route.startsWith('/') ? route : `/${route}`;
  window.location.hash = normalized;
}
