// Slug generation for record ids created from user-entered names (e.g. a new
// category made inline in a picker). Pure — no React, no I/O.
//
// Czech diacritics are folded to ASCII (NFD decomposition, combining marks
// stripped) so "Zábava" → "zabava"; anything else non-alphanumeric collapses
// to single dashes. Collisions against existing ids get a numeric suffix.

/** Lowercase ASCII slug of a name: "Eating out" → "eating-out". May be `''`. */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * A slug of `name` that does not collide with `taken`: the plain slug when
 * free, otherwise `-2`, `-3`, … appended. An empty/unusable name falls back to
 * the stem `"category"`.
 */
export function uniqueSlug(name: string, taken: ReadonlySet<string>): string {
  const base = slugify(name) || 'category';
  if (!taken.has(base)) {
    return base;
  }
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
}
