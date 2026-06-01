/**
 * Collecte les champs **hors cœur** d'un objet natif (rien n'est jeté) : tout ce qui n'est pas dans
 * `known` part dans `xtras`. Retourne `undefined` si rien à conserver (omission propre).
 */
export function xtrasOf(
  raw: Record<string, unknown>,
  known: readonly string[],
): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!known.includes(key)) {
      out[key] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
