// The iOS system-colour palette for icon tiles. Each colour carries a light and
// a dark hex; the tile CSS switches between them by prefers-color-scheme, driven
// by the two custom properties `tileColorStyle` emits. Ids here are the values
// stored on categories/areas.

import type { CSSProperties } from 'react';

/** One selectable tile colour: a light and a dark hex plus a display name. */
export interface IconColor {
  id: string;
  name: string;
  /** Light-theme tile fill. */
  hex: string;
  /** Dark-theme tile fill. */
  hexDark: string;
}

export const ICON_COLORS: IconColor[] = [
  { id: 'red', name: 'Red', hex: '#ff3b30', hexDark: '#ff453a' },
  { id: 'orange', name: 'Orange', hex: '#ff9500', hexDark: '#ff9f0a' },
  { id: 'yellow', name: 'Yellow', hex: '#ffcc00', hexDark: '#ffd60a' },
  { id: 'green', name: 'Green', hex: '#34c759', hexDark: '#30d158' },
  { id: 'teal', name: 'Teal', hex: '#30b0c7', hexDark: '#40c8e0' },
  { id: 'blue', name: 'Blue', hex: '#007aff', hexDark: '#0a84ff' },
  { id: 'indigo', name: 'Indigo', hex: '#5856d6', hexDark: '#5e5ce6' },
  { id: 'purple', name: 'Purple', hex: '#af52de', hexDark: '#bf5af2' },
  { id: 'pink', name: 'Pink', hex: '#ff2d55', hexDark: '#ff375f' },
  { id: 'gray', name: 'Gray', hex: '#8e8e93', hexDark: '#98989e' },
  { id: 'brown', name: 'Brown', hex: '#a2845e', hexDark: '#ac8e68' },
];

const COLOR_BY_ID = new Map<string, IconColor>(ICON_COLORS.map((c) => [c.id, c]));

/** Generic fallback tile colour for an unknown id (systemGray). */
const FALLBACK_COLOR: IconColor = COLOR_BY_ID.get('gray') ?? ICON_COLORS[0];

/** The colour for an id, or the gray fallback when the id is unknown. */
export function colorOf(id: string): IconColor {
  return COLOR_BY_ID.get(id) ?? FALLBACK_COLOR;
}

/** A style carrying both tile hexes as custom properties, plus normal CSS. */
export type TileColorStyle = CSSProperties & {
  '--tile-light': string;
  '--tile-dark': string;
};

/** The two custom properties the tile/swatch CSS reads to paint a colour id. */
export function tileColorStyle(id: string): TileColorStyle {
  const c = colorOf(id);
  return { '--tile-light': c.hex, '--tile-dark': c.hexDark };
}
