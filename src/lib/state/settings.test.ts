import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paletteById, PALETTES } from '../puzzle/palettes.ts';
import { colorName, paletteNames } from '../ui/format.ts';
import { DEFAULT_SETTINGS, effectivePalette, loadSettings, saveSettings } from './settings.ts';
import type { KV } from './storage.ts';

function storageWith(value?: unknown): KV {
  const map = new Map<string, string>();
  if (value !== undefined) map.set('picross:settings', typeof value === 'string' ? value : JSON.stringify(value));
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

test('defaults when nothing, garbage, or no storage', () => {
  assert.deepEqual(loadSettings(storageWith()), DEFAULT_SETTINGS);
  assert.deepEqual(loadSettings(storageWith('{not json')), DEFAULT_SETTINGS);
  assert.deepEqual(loadSettings(null), DEFAULT_SETTINGS);
});

test('out-of-range and wrong-typed values are clamped or replaced', () => {
  const s = loadSettings(
    storageWith({
      width: 99,
      height: 2,
      colors: 9,
      paletteId: 'nope',
      overrides: ['#ABCDEF', 'red', '#00ff00', 5],
      density: 0.1,
      theme: 'neon',
    }),
  );
  assert.equal(s.width, 30);
  assert.equal(s.height, 5);
  assert.equal(s.colors, 6);
  assert.equal(s.paletteId, PALETTES[0]!.id);
  assert.deepEqual(s.overrides, [null, null, '#00ff00', null]); // uppercase hex rejected
  assert.equal(s.density, 0.4);
  assert.equal(s.theme, 'system');
});

test('settings round-trip', () => {
  const storage = storageWith();
  const s = { ...DEFAULT_SETTINGS, width: 12, colors: 3, paletteId: 'earth', overrides: [null, '#123456'], theme: 'dark' as const };
  saveSettings(storage, s);
  assert.deepEqual(loadSettings(storage), s);
});

test('effectivePalette applies overrides to the first N preset colors', () => {
  const preset = paletteById('pastel').colors;
  const palette = effectivePalette({ ...DEFAULT_SETTINGS, paletteId: 'pastel', colors: 3, overrides: [null, '#010203'] });
  assert.deepEqual(palette, [preset[0], '#010203', preset[2]]);
});

test('color names are distinct for every preset', () => {
  for (const p of PALETTES) {
    const names = p.colors.map(colorName);
    assert.equal(new Set(names).size, names.length, `${p.name}: ${names.join(', ')}`);
  }
  assert.equal(colorName('#000000'), 'black');
  assert.equal(colorName('#ffffff'), 'white');
  assert.equal(colorName('#ff0000'), 'red');
  assert.equal(colorName('#0000ff'), 'blue');
  assert.deepEqual(paletteNames(['#ff0000', '#ee1111']), ['red 1', 'red 2']);
});
