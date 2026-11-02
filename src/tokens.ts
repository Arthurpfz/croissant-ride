// Design tokens (CSS variables from tokens.css) for canvas drawing, cached once resolved.
const cache = new Map<string, string>();
export function token(name: string) {
  const v = cache.get(name) ?? getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  if (v) cache.set(name, v);
  return v;
}
