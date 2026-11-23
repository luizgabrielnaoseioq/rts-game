import type { CSSProperties } from 'react';

/**
 * Ícones SVG inline (24×24) desenhados à mão: formas simples, sem asset externo.
 * Os mesmos paths são usados no Phaser (Path2D) para gerar as texturas do mapa.
 * tone: 'base' = cor do ícone; 'dark' = sombra; 'light' = brilho.
 */
export interface IconPart {
  d: string;
  mode: 'fill' | 'stroke';
  tone?: 'base' | 'dark' | 'light';
  width?: number;
}

const f = (d: string, tone: IconPart['tone'] = 'base'): IconPart => ({ d, mode: 'fill', tone });
const s = (d: string, width = 2, tone: IconPart['tone'] = 'base'): IconPart => ({ d, mode: 'stroke', width, tone });

const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0z`;

export const ICONS = {
  // ── recursos ──
  food: [
    s('M12 22V7', 1.6),
    f(
      'M12 8c-2-1-3-3-3-5 2 1 3 3 3 5zm0 0c2-1 3-3 3-5-2 1-3 3-3 5zM12 13c-2.5-1-4-3-4-5.5 2.5 1 4 3 4 5.5zm0 0c2.5-1 4-3 4-5.5-2.5 1-4 3-4 5.5zM12 18c-2.5-1-4-3-4-5.5 2.5 1 4 3 4 5.5zm0 0c2.5-1 4-3 4-5.5-2.5 1-4 3-4 5.5z',
    ),
  ],
  wood: [
    f('M6 7h12v10H6a3 5 0 0 1 0-10z'),
    f(`${circle(18, 12, 3.6)}`, 'light'),
    s('M18 10.2a1.2 1.8 0 1 0 0.01 0', 1.2, 'dark'),
    s('M7 10h7M8 14h6', 1.2, 'dark'),
  ],
  stone: [f('M4 9l8-5 8 5v7l-8 5-8-5z'), f('M4 9l8 5 8-5-8-5z', 'light'), s('M12 14v7', 1.2, 'dark')],
  gold: [f(circle(12, 12, 9)), s(circle(12, 12, 5.5), 1.4, 'dark'), f('M11 9h2v6h-2z', 'dark')],

  // ── prédios ──
  keep: [
    f('M5 22V10h2.5V7.5h2.2V10h1.2V7.5h2.2V10h1.2V7.5h2.2V10H19v12h-5v-4a2 2 0 0 0-4 0v4z'),
    f('M12 0.5c1.6 1.9 2.1 3.2 1.3 4.6-.4.7-1.3 1.3-1.3 1.3s-.9-.6-1.3-1.3C9.9 3.7 10.4 2.4 12 .5z', 'light'),
    f('M8 13h2v2H8zM14 13h2v2h-2z', 'dark'),
  ],
  farm: [] as IconPart[],
  sawmill: [f('M2 15h20v5H2z'), f('M20.5 15a1.5 2.5 0 1 1 0 5z', 'light'), s('M3 12l2-4 2 4 2-4 2 4 2-4 2 4 2-4 2 4 2-4', 1.6)],
  barracks: [
    s('M5 5l14 14M19 5L5 19', 2.4),
    s('M6.5 14.5l3 3M14.5 17.5l3-3', 2.4, 'light'),
    f(`${circle(4, 20, 1.6)}${circle(20, 20, 1.6)}`),
  ],
  quarry: [s('M5 20L15 10', 2.6, 'dark'), f('M7 4c5-1.5 10 0 14 4l-2 1.8C16 7 12 6 8 6.4z'), f('M2 17h6v5H2z', 'light')],
  warehouse: [f('M3 10l9-6 9 6v12H3z'), s('M8 22v-8h8v8M8 14l8 8M16 14l-8 8', 1.3, 'dark')],
  wall: [
    f('M2 22V9h3v2.5h3V9h3v2.5h2V9h3v2.5h3V9h3v13z'),
    s('M2 16h20M7 11.5V16M17 11.5V16M12 16v6M5 22v0', 1.2, 'dark'),
  ],
  infirmary: [f('M9 3h6v6h6v6h-6v6H9v-6H3V9h6z'), f('M10.5 4.5h3v6h6v3h-6v6h-3v-6h-6v-3h6z', 'light')],
  hero_hall: [
    f('M12 2.5c5 0 8 3.5 8 8v4l-3 2v5H7v-5l-3-2v-4c0-4.5 3-8 8-8z'),
    f('M7 10.5h10v2.2H7zM11.2 12.7h1.6v6h-1.6z', 'dark'),
    f('M11 0.5h2v3h-2z', 'light'),
  ],
  gold_mine: [
    f('M7 9l2-3.5 3 2 3-3 3 4.5z', 'light'),
    f('M3 9h18l-2 8H5z'),
    f(`${circle(8, 19.5, 2)}${circle(16, 19.5, 2)}`, 'dark'),
  ],

  // ── navegação / ações ──
  map: [f('M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z'), s('M9 3v15M15 6v15', 1.3, 'dark')],
  scroll: [
    f('M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2z'),
    s('M8 8h8M8 12h8M8 16h5', 1.4, 'dark'),
  ],
  chest: [
    f('M3 11h18v10H3z'),
    f('M4 11V8a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v3z', 'light'),
    s('M3 13.5h18', 1.3, 'dark'),
    f('M10.8 12h2.4v4h-2.4z', 'dark'),
  ],
  crown: [f('M3 8l4.5 4L12 4.5l4.5 7.5L21 8l-2 11H5z'), f('M5 17h14v2H5z', 'dark')],
  sword: [s('M5 19L18 6', 2.4), f('M18 6l3-3-.5 3.5L18 6z'), s('M4 15l5 5', 2.2, 'dark')],
  shield: [f('M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z'), f('M12 4.2l6 2.3V11c0 4-2.7 7.2-6 8.8z', 'light')],
  skull: [
    f('M12 3a8 8 0 0 0-8 8c0 3 1.5 5 3.5 6v3.5h9V17c2-1 3.5-3 3.5-6a8 8 0 0 0-8-8z'),
    f(`${circle(9, 11.5, 1.8)}${circle(15, 11.5, 1.8)}`, 'dark'),
    f('M11 15h2l-1 2z', 'dark'),
  ],
  drop: [f('M12 2c3 5 7 8.5 7 12.5a7 7 0 0 1-14 0C5 10.5 9 7 12 2z'), f('M9 14a3 3 0 0 0 3 3v2a5 5 0 0 1-5-5z', 'light')],
  icecrown: [f('M4 19l1-11 4 4 3-8 3 8 4-4 1 11z'), f('M4 19h16v2H4z', 'dark'), f('M11.3 10h1.4l-.7 5z', 'light')],
  clock: [s(circle(12, 12, 9), 2), s('M12 7v5l3 2', 2)],
  hourglass: [f('M6 2h12v2.5l-4.5 7.5 4.5 7.5V22H6v-2.5l4.5-7.5L6 4.5z'), f('M8.5 19h7l-3.5-5z', 'light')],
  book: [
    f('M3 4h7a2 2 0 0 1 2 2v15a2 2 0 0 0-2-2H3zM21 4h-7a2 2 0 0 0-2 2v15a2 2 0 0 1 2-2h7z'),
    s('M5 8h4M15 8h4M5 11h4M15 11h4', 1.2, 'dark'),
  ],
  gem: [f('M6 3h12l4 6-10 12L2 9z'), s('M2 9h20M9 3l3 18M15 3l-3 18', 1.1, 'dark')],
  spear: [s('M4 20L17 7', 2.2), f('M21 3l-2 7-5-5z')],
  bow: [s('M6 3c9 3 9 15 0 18', 2.2), s('M6 3v18', 1.2, 'light'), s('M3 12h15M15 9l3 3-3 3', 1.6, 'dark')],
  horseshoe: [s('M6.5 21V11a5.5 5.5 0 0 1 11 0v10', 3.2), f(`${circle(6.5, 14, 0.8)}${circle(17.5, 14, 0.8)}`, 'dark')],
  flag: [f('M5 22V3h2v19z'), f('M7 4h12l-3 4 3 4H7z')],
  target: [s(circle(12, 12, 8.5), 2), s(circle(12, 12, 4), 2), f(circle(12, 12, 1.4))],
  recall: [s('M9 14L4 9l5-5', 2.2), s('M4 9h11a5 5 0 0 1 0 10h-4', 2.2)],
  logout: [s('M14 4h5v16h-5', 2), s('M10 8l-4 4 4 4M6 12h10', 2)],
  close: [s('M6 6l12 12M18 6L6 18', 2.4)],
  plus: [s('M12 5v14M5 12h14', 2.4)],
  minus: [s('M5 12h14', 2.4)],
  heart: [f('M12 21l-8.5-8.5A5 5 0 0 1 12 5.5a5 5 0 0 1 8.5 7z')],
  star: [f('M12 2l3 7 7 .5-5.5 4.6 1.8 7.1L12 17.3l-6.3 3.9 1.8-7.1L2 9.5 9 9z')],
  info: [s(circle(12, 12, 9), 2), f('M11 10.5h2V17h-2zM11 7h2v2h-2z')],
  hammer: [s('M14 10L4 20', 2.6, 'dark'), f('M11 4h6l4 4-3 3-4-4h-3z')],
  power: [f('M13 2L4 14h7l-1 8 9-12h-7z')],
} satisfies Record<string, IconPart[]>;

ICONS.farm = ICONS.food;

export type IconName = keyof typeof ICONS;

export const TONE_ALPHA = { base: 1, dark: 0.45, light: 0.35 } as const;

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

export function Icon({ name, size = 20, color = 'currentColor', className, style, title }: IconProps) {
  const parts = ICONS[name] as IconPart[];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      style={style}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title && <title>{title}</title>}
      {parts.map((p, i) => {
        const tone = p.tone ?? 'base';
        const toneColor = tone === 'dark' ? '#000' : tone === 'light' ? '#fff' : color;
        const opacity = tone === 'base' ? 1 : TONE_ALPHA[tone];
        return p.mode === 'fill' ? (
          <path key={i} d={p.d} fill={toneColor} fillOpacity={opacity} />
        ) : (
          <path
            key={i}
            d={p.d}
            fill="none"
            stroke={toneColor}
            strokeOpacity={opacity}
            strokeWidth={p.width ?? 2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
    </svg>
  );
}

export const RESOURCE_COLOR = {
  food: '#D9B44A',
  wood: '#A0703E',
  stone: '#9C9A94',
  gold: '#E8C25A',
} as const;
