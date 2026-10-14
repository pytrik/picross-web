import { writable, type Writable } from 'svelte/store';

/**
 * A Svelte store backed by localStorage. Reads the initial value on creation
 * and writes back on every change. Framework-version-agnostic (plain store),
 * so it works the same in components ($store) and modules (store.subscribe).
 */
export function persisted<T>(key: string, initial: T): Writable<T> {
  let start = initial;
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) start = JSON.parse(raw) as T;
  } catch {
    // ignore malformed/blocked storage — fall back to initial
  }

  const store = writable<T>(start);

  store.subscribe((value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // storage full or blocked — silently skip
    }
  });

  return store;
}
