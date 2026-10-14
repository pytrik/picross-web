export interface PalettePreset {
  id: string;
  name: string;
  /** Six colors; a puzzle with N colors uses the first N. */
  colors: string[];
}

export const PALETTES: PalettePreset[] = [
  { id: 'classic', name: 'Classic', colors: ['#222222', '#d94040', '#3070d0', '#e0a020', '#40a050', '#9050c0'] },
  { id: 'pastel', name: 'Pastel', colors: ['#5a6a7a', '#f08a8a', '#8ab4f0', '#f0d27a', '#8fd19e', '#c5a3e8'] },
  { id: 'earth', name: 'Earth', colors: ['#3b2f2a', '#a0522d', '#6b8e23', '#d2b48c', '#4682b4', '#cd853f'] },
  // Okabe-Ito: distinguishable under common color-vision deficiencies.
  { id: 'contrast', name: 'High contrast', colors: ['#000000', '#e69f00', '#56b4e9', '#009e73', '#f0e442', '#d55e00'] },
];

export const paletteById = (id: string) => PALETTES.find((p) => p.id === id) ?? PALETTES[0]!;
