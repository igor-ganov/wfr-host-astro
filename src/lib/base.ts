// Astro injects the configured base (with trailing slash) as BASE_URL, both on
// the server and in client bundles. Hand-written internal links/asset URLs are
// NOT auto-prefixed by Astro, so route them through `withBase`.
const BASE: string = import.meta.env.BASE_URL;

/**
 * Prefix an app-relative path with the configured base (e.g. `viewer/x`),
 * tolerating a base with or without a trailing slash. Empty path → base root.
 */
export const withBase = (path: string): string => {
  const base = BASE.replace(/\/+$/, '');
  const rel = path.replace(/^\/+/, '');
  return rel === '' ? `${base}/` : `${base}/${rel}`;
};
