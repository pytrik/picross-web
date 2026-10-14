const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK = 0xffffffffffffffffn;

/** FNV-1a 64-bit of the UTF-8 bytes of `text`, as 16 hex chars. */
export function fnv1a64(text: string): string {
  let h = FNV_OFFSET;
  for (const byte of new TextEncoder().encode(text)) {
    h ^= BigInt(byte);
    h = (h * FNV_PRIME) & MASK;
  }
  return h.toString(16).padStart(16, '0');
}

/** Storage key for a puzzle (SPEC §7.2). */
export function puzzleKey(source: { hash: string } | { id: string }): string {
  return 'id' in source ? `id:${source.id}` : fnv1a64(source.hash);
}
