import { MAX_COLORS, MAX_SIZE, MIN_SIZE } from '../puzzle/types.ts';
import { paletteById, PALETTES } from '../puzzle/palettes.ts';
import type { Target } from '../puzzle/rating.ts';
import { STYLES, type Style } from '../puzzle/styles.ts';
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
  /** Target difficulty (SPEC §5.5); anything but 'any' overrides density. */
  difficulty: Target;
  /** Grid style (SPEC §5.6). */
  style: Style;
  theme: Theme;
  /** Tint clues of lines that can no longer fit (SPEC §6.5). */
  showErrors: boolean;
  /** X the rest of a line once its fills match the clue (SPEC §6.5). */
  autoX: boolean;
}

/** The size and palette part of the settings, shared with the editor draft (SPEC §6.10). */
export type GridSettings = Pick<Settings, 'width' | 'height' | 'colors' | 'paletteId' | 'overrides'>;

export const DEFAULT_SETTINGS: Settings = {
  width: 10,
  height: 10,
  colors: 1,
  paletteId: PALETTES[0]!.id,
  overrides: [],
  density: 0.58,
  difficulty: 'any',
  style: 'random',
  theme: 'system',
  showErrors: true,
  autoX: false,
};

export const MIN_DENSITY = 0.4;
export const MAX_DENSITY = 0.75;

const KEY = 'picross:settings';

/** A typed width/height rounded and clamped to 5..30 (empty input → 5). */
export const clampSize = (v: number) => Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(v) || MIN_SIZE));
const clamp = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

/** Per-swatch overrides from storage: valid colors kept, anything else null. */
export function loadOverrides(value: unknown): (string | null)[] {
  return Array.isArray(value)
    ? value.slice(0, MAX_COLORS).map((c) => (typeof c === 'string' && /^#[0-9a-f]{6}$/.test(c) ? c : null))
    : [];
}

export function loadSettings(storage: KV | null): Settings {
  const s = readJson<Partial<Settings>>(storage, KEY) ?? {};
  const d = DEFAULT_SETTINGS;
  return {
    width: Math.round(clamp(s.width, MIN_SIZE, MAX_SIZE, d.width)),
    height: Math.round(clamp(s.height, MIN_SIZE, MAX_SIZE, d.height)),
    colors: Math.round(clamp(s.colors, 1, MAX_COLORS, d.colors)),
    paletteId: paletteById(String(s.paletteId)).id,
    overrides: loadOverrides(s.overrides),
    density: clamp(s.density, MIN_DENSITY, MAX_DENSITY, d.density),
    difficulty: s.difficulty === 'easy' || s.difficulty === 'medium' || s.difficulty === 'hard' ? s.difficulty : 'any',
    style: STYLES.includes(s.style as Style) ? (s.style as Style) : 'random',
    theme: s.theme === 'light' || s.theme === 'dark' ? s.theme : 'system',
    showErrors: typeof s.showErrors === 'boolean' ? s.showErrors : d.showErrors,
    autoX: typeof s.autoX === 'boolean' ? s.autoX : d.autoX,
  };
}

export function saveSettings(storage: KV | null, settings: Settings): void {
  writeJson(storage, KEY, settings);
}

/** The palette the generator would use for these settings. */
export function effectivePalette(settings: Pick<GridSettings, 'paletteId' | 'colors' | 'overrides'>): string[] {
  const preset = paletteById(settings.paletteId).colors;
  return preset.slice(0, settings.colors).map((c, i) => settings.overrides[i] ?? c);
}
