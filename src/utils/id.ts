// A random id for new records. Uses crypto.randomUUID where available (all
// modern browsers and the test runtime); falls back to a time+random string so
// nothing crashes in an ancient environment.
export function newId(prefix = 'id'): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}
