/** `mm:ss`, or `h:mm:ss` past an hour (SPEC §6.5). */
export function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/** WCAG contrast ratio between two `#rrggbb` colors. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Black or white, whichever reads better on `bg`. */
export const textOn = (bg: string) => (contrast(bg, '#000000') >= contrast(bg, '#ffffff') ? '#000000' : '#ffffff');

/** `#rrggbb` → [hue 0..360, saturation 0..1, lightness 0..1]. */
function toHsl(hex: string): [number, number, number] {
  const [r, g, b] = [0, 1, 2].map((i) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

const HUES: [number, string][] = [
  [15, 'red'],
  [35, 'orange'],
  [48, 'amber'],
  [70, 'yellow'],
  [150, 'green'],
  [185, 'teal'],
  [250, 'blue'],
  [290, 'purple'],
  [335, 'pink'],
  [360, 'red'],
];

/** Approximate English name for a color, for screen readers (SPEC §9). */
export function colorName(hex: string): string {
  const [h, s, l] = toHsl(hex);
  if (l < 0.2 && (s < 0.25 || l < 0.12)) return 'black';
  if (l > 0.93) return 'white';
  if (s < 0.18) return l < 0.35 ? 'dark gray' : l > 0.7 ? 'light gray' : 'gray';
  let name = HUES.find(([max]) => h < max)![1];
  if (name === 'orange' || name === 'amber') {
    // Muted oranges read as brown (dark) or tan (light).
    if (l < 0.45 && s < 0.8) return l < 0.25 ? 'dark brown' : 'brown';
    if (s < 0.5) return 'tan';
  }
  if (l < 0.3) name = `dark ${name}`;
  else if (l > 0.7) name = `light ${name}`;
  return name;
}

/** Names for a palette, numbered when two colors get the same name. */
export function paletteNames(palette: string[]): string[] {
  const names = palette.map(colorName);
  return names.map((name, i) => (names.filter((n) => n === name).length > 1 ? `${name} ${names.slice(0, i + 1).filter((n) => n === name).length}` : name));
}

/** "just now", "5 min ago", "3 h ago", "yesterday", else a short date. */
export function formatWhen(ts: number, now = Date.now()): string {
  const min = Math.floor((now - ts) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} h ago`;
  if (min < 48 * 60) return 'yesterday';
  const date = new Date(ts);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' });
}
