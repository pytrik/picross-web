import { MAX_COLORS, MAX_SIZE, MIN_SIZE, PuzzleError, type PuzzleDef } from './types.ts';

// --- base64url (RFC 4648 §5, no padding) ---------------------------------

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64_INDEX = new Map([...B64].map((ch, i) => [ch, i]));

export function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = bytes[i + 1] ?? 0;
    const b2 = bytes[i + 2] ?? 0;
    const n = (b0 << 16) | (b1 << 8) | b2;
    const chars = i + 2 < bytes.length ? 4 : i + 1 < bytes.length ? 3 : 2;
    for (let c = 0; c < chars; c++) out += B64[(n >> (18 - 6 * c)) & 63];
  }
  return out;
}

export function fromBase64Url(text: string): Uint8Array {
  if (text.length % 4 === 1) throw new PuzzleError('Bad base64url length');
  const bytes = new Uint8Array(Math.floor((text.length * 6) / 8));
  let acc = 0;
  let accBits = 0;
  let o = 0;
  for (const ch of text) {
    const v = B64_INDEX.get(ch);
    if (v === undefined) throw new PuzzleError('Bad base64url character');
    acc = (acc << 6) | v;
    accBits += 6;
    if (accBits >= 8) {
      accBits -= 8;
      bytes[o++] = (acc >> accBits) & 0xff;
    }
  }
  // Leftover bits must be zero, otherwise the encoding isn't canonical.
  if (acc & ((1 << accBits) - 1)) throw new PuzzleError('Non-canonical base64url');
  return bytes;
}

// --- bit packing (MSB-first) -----------------------------------------------

/** Bits needed to store values 0..maxValue. */
export function bitsFor(maxValue: number): number {
  return Math.max(1, Math.ceil(Math.log2(maxValue + 1)));
}

export function packValues(values: ArrayLike<number>, bits: number): Uint8Array {
  const out = new Uint8Array(Math.ceil((values.length * bits) / 8));
  let bit = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    for (let b = bits - 1; b >= 0; b--, bit++) {
      if ((v >> b) & 1) out[bit >> 3]! |= 0x80 >> (bit & 7);
    }
  }
  return out;
}

export function unpackValues(bytes: Uint8Array, count: number, bits: number): Uint8Array {
  const totalBits = count * bits;
  if (bytes.length !== Math.ceil(totalBits / 8)) throw new PuzzleError('Bad data length');
  const out = new Uint8Array(count);
  let bit = 0;
  for (let i = 0; i < count; i++) {
    let v = 0;
    for (let b = 0; b < bits; b++, bit++) {
      v = (v << 1) | ((bytes[bit >> 3]! >> (7 - (bit & 7))) & 1);
    }
    out[i] = v;
  }
  for (; bit < bytes.length * 8; bit++) {
    if ((bytes[bit >> 3]! >> (7 - (bit & 7))) & 1) throw new PuzzleError('Non-zero padding');
  }
  return out;
}

// --- validation --------------------------------------------------------------

const COLOR_RE = /^#[0-9a-f]{6}$/;

/** Throws PuzzleError when `def` violates SPEC §4.1. */
export function validatePuzzle(def: PuzzleDef): void {
  const { width, height, palette, cells } = def;
  for (const [name, v] of [['width', width], ['height', height]] as const) {
    if (!Number.isInteger(v) || v < MIN_SIZE || v > MAX_SIZE) {
      throw new PuzzleError(`${name} must be ${MIN_SIZE}..${MAX_SIZE}`);
    }
  }
  if (palette.length < 1 || palette.length > MAX_COLORS) throw new PuzzleError('Bad palette size');
  if (!palette.every((c) => COLOR_RE.test(c))) throw new PuzzleError('Bad palette color');
  if (new Set(palette).size !== palette.length) throw new PuzzleError('Duplicate palette color');
  if (cells.length !== width * height) throw new PuzzleError('Bad cell count');
  const used = new Set<number>();
  for (const v of cells) {
    if (v > palette.length) throw new PuzzleError('Cell color out of range');
    if (v) used.add(v);
  }
  if (used.size === 0) throw new PuzzleError('Puzzle is empty');
  if (used.size !== palette.length) throw new PuzzleError('Unused palette color');
}

// --- hash format (SPEC §4.2) -----------------------------------------------

const FORMAT_VERSION = '1';

/** Canonical `p=` hash body (without `#`). */
export function encodePuzzle(def: PuzzleDef): string {
  const palette = def.palette.map((c) => c.slice(1).toLowerCase()).join('-');
  const data = toBase64Url(packValues(def.cells, bitsFor(def.palette.length)));
  return `p=${FORMAT_VERSION}.${def.width}x${def.height}.${palette}.${data}`;
}

/** Decodes the value after `p=`. Throws PuzzleError on anything invalid. */
export function decodePuzzle(value: string): PuzzleDef {
  const parts = value.split('.');
  if (parts.length !== 4) throw new PuzzleError('Malformed puzzle');
  const [version, size, paletteText, data] = parts as [string, string, string, string];
  if (version !== FORMAT_VERSION) throw new PuzzleError('Unsupported puzzle version');
  const m = /^([1-9]\d?)x([1-9]\d?)$/.exec(size);
  if (!m) throw new PuzzleError('Malformed size');
  const width = Number(m[1]);
  const height = Number(m[2]);
  if (!/^[0-9a-f]{6}(-[0-9a-f]{6})*$/.test(paletteText)) throw new PuzzleError('Malformed palette');
  const palette = paletteText.split('-').map((c) => `#${c}`);
  if (width * height > MAX_SIZE * MAX_SIZE) throw new PuzzleError('Too large');
  const cells = unpackValues(fromBase64Url(data), width * height, bitsFor(palette.length));
  const def: PuzzleDef = { width, height, palette, cells };
  validatePuzzle(def);
  return def;
}

export type HashTarget =
  | { kind: 'none' }
  | { kind: 'puzzle'; value: string }
  | { kind: 'id'; id: string }
  /** The puzzle editor (SPEC §6.10). */
  | { kind: 'edit' }
  | { kind: 'invalid' };

/** Classifies `location.hash` (with or without the leading `#`). */
export function parseHash(hash: string): HashTarget {
  const body = hash.startsWith('#') ? hash.slice(1) : hash;
  if (body === '') return { kind: 'none' };
  if (body === 'edit') return { kind: 'edit' };
  if (body.startsWith('p=')) return { kind: 'puzzle', value: body.slice(2) };
  if (body.startsWith('id=') && body.length > 3) {
    return { kind: 'id', id: decodeURIComponent(body.slice(3)) };
  }
  return { kind: 'invalid' };
}
