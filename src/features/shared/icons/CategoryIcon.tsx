// A colourful iOS-Settings-style icon: a white glyph centred in a rounded-square
// ("squircle") tile filled with a theme-appropriate colour. Decorative — always
// rendered aria-hidden, so callers must provide their own text/label.

import { ICON_LIBRARY } from './glyphs';
import { tileColorStyle, type TileColorStyle } from './colors';
import styles from './CategoryIcon.module.css';

const GLYPH_BY_ID = new Map(ICON_LIBRARY.map((g) => [g.id, g] as const));
/** Unknown icon ids render this. */
const FALLBACK_GLYPH = GLYPH_BY_ID.get('ellipsis') ?? ICON_LIBRARY[0];

interface CategoryIconProps {
  /** An ICON_LIBRARY id; unknown ids render the ellipsis fallback. */
  iconId: string;
  /** An ICON_COLORS id; unknown ids render the gray tile. */
  color: string;
  /** Tile side length in px (default 28). */
  size?: number;
  className?: string;
}

export function CategoryIcon({ iconId, color, size = 28, className }: CategoryIconProps) {
  const glyph = GLYPH_BY_ID.get(iconId) ?? FALLBACK_GLYPH;
  const Svg = glyph.Svg;
  const style: TileColorStyle = {
    ...tileColorStyle(color),
    width: size,
    height: size,
    // ~28% radius approximates the iOS app-icon squircle.
    borderRadius: Math.round(size * 0.28),
  };
  return (
    <span
      className={className ? `${styles.tile} ${className}` : styles.tile}
      style={style}
      aria-hidden="true"
    >
      <Svg size={Math.round(size * 0.62)} className={styles.glyph} />
    </span>
  );
}
