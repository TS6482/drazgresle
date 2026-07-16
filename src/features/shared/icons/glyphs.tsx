// The inline-SVG glyph library for category/area icons. Every glyph is a single
// self-contained 24×24 SVG using `currentColor` (the tile paints it white) — no
// external refs, no image loads, so it is CSP-safe. Paths are kept simple to stay
// legible at ~20px. Ids here are the values stored on categories/areas.

import type { ReactNode } from 'react';

/** Props a glyph accepts: a square pixel size (default 24) and an optional class. */
export interface IconSvgProps {
  size?: number;
  className?: string;
}

/** One selectable glyph. `label` names it in the picker; `Svg` renders it. */
export interface IconGlyph {
  id: string;
  label: string;
  Svg: (props: IconSvgProps) => JSX.Element;
}

/** Shared line-icon frame: white stroke, rounded joins, transparent fill. */
function Stroke({ size = 24, className, children }: IconSvgProps & { children: ReactNode }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const ICON_LIBRARY: IconGlyph[] = [
  {
    id: 'house',
    label: 'House',
    Svg: (p) => (
      <Stroke {...p}>
        <path d="M4 11.5 12 4l8 7.5" />
        <path d="M6 10v9.5h12V10" />
        <path d="M10 19.5V14h4v5.5" />
      </Stroke>
    ),
  },
  {
    id: 'building',
    label: 'Building',
    Svg: (p) => (
      <Stroke {...p}>
        <path d="M5 20V4.5A1.5 1.5 0 0 1 6.5 3h6A1.5 1.5 0 0 1 14 4.5V20" />
        <path d="M14 9h3.5A1.5 1.5 0 0 1 19 10.5V20" />
        <path d="M3 20.5h18" />
        <path d="M8 7h2M8 11h2M8 15h2" />
      </Stroke>
    ),
  },
  {
    id: 'shield',
    label: 'Shield',
    Svg: (p) => (
      <Stroke {...p}>
        <path d="M12 3.5 19 6v5c0 4.2-2.9 7.3-7 9-4.1-1.7-7-4.8-7-9V6z" />
      </Stroke>
    ),
  },
  {
    id: 'phone',
    label: 'Phone',
    Svg: (p) => (
      <Stroke {...p}>
        <rect x="7" y="3" width="10" height="18" rx="2" />
        <path d="M11 17.5h2" />
      </Stroke>
    ),
  },
  {
    id: 'car',
    label: 'Car',
    Svg: (p) => (
      <Stroke {...p}>
        <path d="M5 15.5v-2l1.8-5.2A2 2 0 0 1 8.7 7h6.6a2 2 0 0 1 1.9 1.3L19 13.5v2" />
        <path d="M8.2 8l1-2h5.6l1 2" />
        <path d="M5.2 13.5h13.6" />
        <circle cx="8" cy="16" r="1.6" />
        <circle cx="16" cy="16" r="1.6" />
      </Stroke>
    ),
  },
  {
    id: 'heart',
    label: 'Heart',
    Svg: (p) => (
      <Stroke {...p}>
        <path d="M12 20c-.5-.4-8-4.7-8-9.8A3.7 3.7 0 0 1 12 8a3.7 3.7 0 0 1 8 2.2C20 15.3 12.5 19.6 12 20z" />
      </Stroke>
    ),
  },
  {
    id: 'cart',
    label: 'Cart',
    Svg: (p) => (
      <Stroke {...p}>
        <path d="M4 5h2l1.5 9h9L19 8H7" />
        <circle cx="9" cy="18.5" r="1.4" />
        <circle cx="16.5" cy="18.5" r="1.4" />
      </Stroke>
    ),
  },
  {
    id: 'fork-knife',
    label: 'Fork & knife',
    Svg: (p) => (
      <Stroke {...p}>
        <path d="M7 3v4M10 3v4" />
        <path d="M6 7h5" />
        <path d="M8.5 7v14" />
        <path d="M16 3c2.2 1.6 2.2 7.4 0 9" />
        <path d="M16 12v9" />
      </Stroke>
    ),
  },
  {
    id: 'bag',
    label: 'Shopping bag',
    Svg: (p) => (
      <Stroke {...p}>
        <path d="M6.5 8h11l-1 12h-9z" />
        <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
      </Stroke>
    ),
  },
  {
    id: 'star',
    label: 'Star',
    Svg: (p) => (
      <Stroke {...p}>
        <path d="M12 4l2.35 4.76 5.25.76-3.8 3.71.9 5.24L12 16.9l-4.7 2.47.9-5.24-3.8-3.71 5.25-.76z" />
      </Stroke>
    ),
  },
  {
    id: 'airplane',
    label: 'Airplane',
    Svg: (p) => (
      <Stroke {...p}>
        <path d="M21 4 3 11.2l7 2.6L12.6 21z" />
        <path d="M21 4 10 13.8" />
      </Stroke>
    ),
  },
  {
    id: 'arrows-repeat',
    label: 'Repeat',
    Svg: (p) => (
      <Stroke {...p}>
        <path d="M4.5 10a7.5 7.5 0 0 1 12.4-4" />
        <path d="M17 3.5V6.5h-3" />
        <path d="M19.5 14a7.5 7.5 0 0 1-12.4 4" />
        <path d="M7 20.5V17.5h3" />
      </Stroke>
    ),
  },
  {
    id: 'child',
    label: 'Child',
    Svg: (p) => (
      <Stroke {...p}>
        <circle cx="12" cy="5.5" r="2.5" />
        <path d="M12 8v6" />
        <path d="M8.5 11h7" />
        <path d="M12 14l-2.5 5.5M12 14l2.5 5.5" />
      </Stroke>
    ),
  },
  {
    id: 'tag',
    label: 'Tag',
    Svg: (p) => (
      <Stroke {...p}>
        <path d="M11.5 4H19a1 1 0 0 1 1 1v7.5a1 1 0 0 1-.3.7l-7 7a1 1 0 0 1-1.4 0l-6.5-6.5a1 1 0 0 1 0-1.4l7-7a1 1 0 0 1 .7-.3z" />
        <circle cx="16" cy="8" r="1.1" />
      </Stroke>
    ),
  },
  {
    id: 'banknote',
    label: 'Banknote',
    Svg: (p) => (
      <Stroke {...p}>
        <rect x="2.5" y="6" width="19" height="12" rx="2" />
        <circle cx="12" cy="12" r="2.5" />
        <path d="M6 9.5h.01M18 14.5h.01" />
      </Stroke>
    ),
  },
  {
    id: 'chart-uptrend',
    label: 'Uptrend',
    Svg: (p) => (
      <Stroke {...p}>
        <path d="M4 5v15h15" />
        <path d="M7.5 15l3.5-3.5 3 2.5L20 7" />
        <path d="M15.5 7H20v4.5" />
      </Stroke>
    ),
  },
  {
    id: 'briefcase',
    label: 'Briefcase',
    Svg: (p) => (
      <Stroke {...p}>
        <rect x="3" y="7.5" width="18" height="11.5" rx="2" />
        <path d="M8.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5" />
        <path d="M3 12.5h18" />
      </Stroke>
    ),
  },
  {
    id: 'two-people',
    label: 'Two people',
    Svg: (p) => (
      <Stroke {...p}>
        <circle cx="9" cy="8" r="2.6" />
        <path d="M3.5 19v-.5a5.5 5.5 0 0 1 11 0v.5" />
        <circle cx="16.5" cy="8.5" r="2.1" />
        <path d="M15 14.2a4.6 4.6 0 0 1 5.5 4.3v.5" />
      </Stroke>
    ),
  },
  {
    id: 'arrows-left-right',
    label: 'Transfer',
    Svg: (p) => (
      <Stroke {...p}>
        <path d="M4 9.5h13" />
        <path d="M14 6.5 17 9.5 14 12.5" />
        <path d="M20 14.5H7" />
        <path d="M10 11.5 7 14.5 10 17.5" />
      </Stroke>
    ),
  },
  {
    id: 'gift',
    label: 'Gift',
    Svg: (p) => (
      <Stroke {...p}>
        <rect x="4" y="9" width="16" height="11" rx="1.5" />
        <path d="M4 13h16" />
        <path d="M12 9v11" />
        <path d="M12 9S10.5 5 8.3 5a2 2 0 0 0 0 4H12z" />
        <path d="M12 9s1.5-4 3.7-4a2 2 0 0 1 0 4H12z" />
      </Stroke>
    ),
  },
  {
    id: 'cup',
    label: 'Cup',
    Svg: (p) => (
      <Stroke {...p}>
        <path d="M6 8h10.5v3.5A5.25 5.25 0 0 1 6 11.5z" />
        <path d="M16.5 9h1.5a2 2 0 0 1 0 4h-1.5" />
        <path d="M9 3c-.6 1 .6 2 0 3M12.5 3c-.6 1 .6 2 0 3" />
        <path d="M5 20.5h12" />
      </Stroke>
    ),
  },
  {
    id: 'ellipsis',
    label: 'More',
    Svg: (p) => (
      <Stroke {...p}>
        <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
      </Stroke>
    ),
  },
];
