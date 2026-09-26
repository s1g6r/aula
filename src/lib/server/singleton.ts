// Module-level state that must be shared across the whole Node process.
// Next bundles route handlers separately and dev mode hot-reloads modules,
// so plain module variables can end up duplicated; globalThis cannot.
export function singleton<T>(name: string, create: () => T): T {
  const g = globalThis as unknown as Record<string, T | undefined>;
  const key = `__aula_${name}`;
  return (g[key] ??= create());
}
