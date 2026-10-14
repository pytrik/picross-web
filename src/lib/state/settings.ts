import { MAX_COLORS, MAX_SIZE, MIN_SIZE } from '../puzzle/types.ts';
import { paletteById, PALETTES } from '../puzzle/palettes.ts';
import { readJson, writeJson, type KV } from './storage.ts';

export type Theme = 'system' | 'light' | 'dark';

/** Last-used generator options + UI prefs (SPEC §7.3). */
export interface Settings {
  width: number;
  height: number;
  colors: number;
  paletteId: string;
  /** Per-swatch overrides by index; null = use the preset color. */
  overrides: (string | null)[];
  density: number;
  theme: Theme;
}

export const DEFAULT_SETTINGS: Settings = {
  width: 10,
  height: 10,
  colors: 1,
  paletteId: PALETTES[0]!.id,
  overrides: [],
  density: 0.58,
  theme: 'system',
};

export const MIN_DENSITY = 0.4;
export const MAX_DENSITY = 0.75;

const KEY = 'picross:settings';
const clamp = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

export function loadSettings(storage: KV | null): Settings {
  const s = readJson<Partial<Settings>>(storage, KEY) ?? {};
  const d = DEFAULT_SETTINGS;
  return {
    width: Math.round(clamp(s.width, MIN_SIZE, MAX_SIZE, d.width)),
    height: Math.round(clamp(s.height, MIN_SIZE, MAX_SIZE, d.height)),
    colors: Math.round(clamp(s.colors, 1, MAX_COLORS, d.colors)),
    paletteId: paletteById(String(s.paletteId)).id,
    overrides: Array.isArray(s.overrides)
      ? s.overrides.slice(0, MAX_COLORS).map((c) => (typeof c === 'string' && /^#[0-9a-f]{6}$/.test(c) ? c : null))
      : [],
    density: clamp(s.density, MIN_DENSITY, MAX_DENSITY, d.density),
    theme: s.theme === 'light' || s.theme === 'dark' ? s.theme : 'system',
  };
}

export function saveSettings(storage: KV | null, settings: Settings): void {
  writeJson(storage, KEY, settings);
}

/** The palette the generator would use for these settings. */
export function effectivePalette(settings: Settings): string[] {
  const preset = paletteById(settings.paletteId).colors;
  return preset.slice(0, settings.colors).map((c, i) => settings.overrides[i] ?? c);
}
