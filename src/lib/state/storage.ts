/** Minimal Storage surface, so tests can pass an in-memory fake. */
export type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** localStorage, or null when blocked (private mode, sandboxed iframe...). */
export function defaultStorage(): KV | null {
  try {
    const s = globalThis.localStorage;
    const probe = 'picross:probe';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function readJson<T>(storage: KV | null, key: string): T | null {
  try {
    const raw = storage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(storage: KV | null, key: string, value: unknown): void {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // full or blocked: skip
  }
}
