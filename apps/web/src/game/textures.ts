import * as Phaser from 'phaser';
import {
  BIOMES,
  BIOMES_ORDER,
  OBSTACLES,
  hashString,
  mulberry32,
  type CampTypeId,
  type EraId,
  type ResourceKey,
} from '@wn/shared';
import { ICONS, RESOURCE_COLOR, TONE_ALPHA, type IconName, type IconPart } from '../components/icons';
import { bannerColor } from '../i18n/labels';

/** Lado da textura de uma casa (2× o tamanho em mundo, para ficar nítido no zoom 2). */
export const TEX = 64;
/** Atlas do terreno: 1 px de margem + 2 px de espaçamento (borda extrudada evita costura no zoom). */
export const ATLAS_MARGIN = 1;
export const ATLAS_SPACING = 2;
const CELL = TEX + ATLAS_SPACING;

export const SHADE_LEVELS = 4;
/** Índice do tile base: bioma × xadrez × tom. */
export function baseTileIndex(biome: number, checker: number, shade: number): number {
  return biome * (2 * SHADE_LEVELS) + checker * SHADE_LEVELS + shade;
}
export const BASE_TILE_COUNT = BIOMES_ORDER.length * 2 * SHADE_LEVELS;
export const OBSTACLE_VARIANTS = 3;
/** Índice do tile de obstáculo (kind 1..3 = montanha, lago, ruína). */
export function obstacleTileIndex(kind: number, variant: number): number {
  return BASE_TILE_COUNT + (kind - 1) * OBSTACLE_VARIANTS + variant;
}
const TOTAL_TILES = BASE_TILE_COUNT + 3 * OBSTACLE_VARIANTS;

// ── cores ──

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** amt > 0 clareia, < 0 escurece (−1..1). */
export function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  const c = (v: number) => Math.round((t - v) * p + v);
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

export function hexToNumber(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

// ── desenho de ícone (mesmos paths do React) ──

export function drawIcon(ctx: CanvasRenderingContext2D, name: IconName, x: number, y: number, size: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const p of ICONS[name] as IconPart[]) {
    const tone = p.tone ?? 'base';
    const c = tone === 'dark' ? '#000' : tone === 'light' ? '#fff' : color;
    ctx.globalAlpha = tone === 'base' ? 1 : TONE_ALPHA[tone];
    const path = new Path2D(p.d);
    if (p.mode === 'fill') {
      ctx.fillStyle = c;
      ctx.fill(path);
    } else {
      ctx.strokeStyle = c;
      ctx.lineWidth = p.width ?? 2;
      ctx.stroke(path);
    }
  }
  ctx.restore();
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível');
  return [c, ctx];
}

function addCanvasTexture(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement): string {
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, canvas);
  return key;
}

// ── terreno ──

function drawBaseTile(ctx: CanvasRenderingContext2D, ox: number, oy: number, biomeIdx: number, checker: number, shadeLevel: number): void {
  const biome = BIOMES[BIOMES_ORDER[biomeIdx]];
  const baseColor = biome.colors[checker];
  const shadeAmt = [-0.1, -0.035, 0.035, 0.09][shadeLevel];
  ctx.fillStyle = shade(baseColor, shadeAmt);
  ctx.fillRect(ox, oy, CELL, CELL);

  const rng = mulberry32(hashString(`tile:${biomeIdx}:${checker}:${shadeLevel}`));
  const id = biome.id;
  const px = (n: number) => ox + 1 + n * TEX;
  // Manchas suaves de cor (quebram a grade).
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = shade(baseColor, (rng() - 0.5) * 0.14);
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.ellipse(px(rng()), oy + 1 + rng() * TEX, 6 + rng() * 12, 4 + rng() * 8, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (id === 'vale') {
    // Tufos de capim.
    ctx.strokeStyle = shade(baseColor, -0.28);
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 7; i++) {
      const x = px(rng() * 0.9 + 0.05);
      const y = oy + 6 + rng() * (TEX - 8);
      ctx.beginPath();
      ctx.moveTo(x - 2, y);
      ctx.lineTo(x - 3, y - 4);
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - 5);
      ctx.moveTo(x + 2, y);
      ctx.lineTo(x + 3, y - 4);
      ctx.stroke();
    }
  } else if (id === 'waste') {
    // Rachaduras de sal e pontos claros.
    ctx.strokeStyle = shade(baseColor, -0.22);
    ctx.lineWidth = 1;
    ctx.beginPath();
    let x = px(rng());
    let y = oy + 1 + rng() * TEX;
    ctx.moveTo(x, y);
    for (let i = 0; i < 4; i++) {
      x += (rng() - 0.5) * 22;
      y += (rng() - 0.5) * 22;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,248,230,0.45)';
    for (let i = 0; i < 9; i++) ctx.fillRect(px(rng()), oy + 1 + rng() * TEX, 1.6, 1.6);
  } else {
    // Brilhos de gelo.
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 8; i++) ctx.fillRect(px(rng()), oy + 1 + rng() * TEX, 1.5, 1.5);
    ctx.strokeStyle = 'rgba(90,120,140,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const y0 = oy + 1 + rng() * TEX;
    ctx.moveTo(ox, y0);
    ctx.quadraticCurveTo(ox + CELL / 2, y0 + (rng() - 0.5) * 16, ox + CELL, y0 + (rng() - 0.5) * 8);
    ctx.stroke();
  }
}

function drawObstacleTile(ctx: CanvasRenderingContext2D, ox: number, oy: number, kind: number, variant: number): void {
  const rng = mulberry32(hashString(`obs:${kind}:${variant}`));
  const cx = ox + CELL / 2;
  const by = oy + CELL - 6;
  if (kind === 1) {
    // Montanha: 1–2 triângulos com neve no pico.
    const color = OBSTACLES.mountain.color;
    const peaks = variant === 0 ? [[0, 1]] : variant === 1 ? [[-12, 0.75], [10, 1]] : [[8, 0.7], [-8, 0.95]];
    for (const [dx, hscale] of peaks) {
      const h = (TEX - 12) * hscale;
      const w = 30 * hscale + 8;
      const x = cx + dx;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x - w / 2, by);
      ctx.lineTo(x, by - h);
      ctx.lineTo(x + w / 2, by);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = shade(color, -0.3);
      ctx.beginPath();
      ctx.moveTo(x, by - h);
      ctx.lineTo(x + w / 2, by);
      ctx.lineTo(x + 2, by);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#E6E2DA';
      ctx.beginPath();
      ctx.moveTo(x, by - h);
      ctx.lineTo(x - w * 0.14, by - h * 0.72);
      ctx.lineTo(x, by - h * 0.78);
      ctx.lineTo(x + w * 0.14, by - h * 0.7);
      ctx.closePath();
      ctx.fill();
    }
  } else if (kind === 2) {
    // Lago: mancha azul-petróleo com borda irregular.
    const color = OBSTACLES.lake.color;
    ctx.fillStyle = color;
    ctx.beginPath();
    const n = 10;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = TEX * 0.44 + (rng() - 0.5) * 8;
      const x = cx + Math.cos(a) * r;
      const y = oy + CELL / 2 + Math.sin(a) * r * 0.85;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = shade(color, -0.35);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(190,220,230,0.35)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const y = oy + 20 + i * 10 + rng() * 4;
      ctx.beginPath();
      ctx.moveTo(cx - 10 + rng() * 6, y);
      ctx.lineTo(cx + 4 + rng() * 8, y);
      ctx.stroke();
    }
  } else {
    // Ruína: colunas quebradas.
    const color = OBSTACLES.ruin.color;
    const cols = 2 + variant;
    for (let i = 0; i < cols; i++) {
      const x = ox + 12 + i * ((CELL - 24) / Math.max(1, cols - 1)) - 4;
      const h = 14 + rng() * 26;
      ctx.fillStyle = color;
      ctx.fillRect(x, by - h, 9, h);
      ctx.fillStyle = shade(color, -0.3);
      ctx.fillRect(x + 6, by - h, 3, h);
      ctx.fillStyle = shade(color, 0.2);
      ctx.beginPath();
      ctx.moveTo(x - 1, by - h);
      ctx.lineTo(x + 4, by - h - 4 - rng() * 4);
      ctx.lineTo(x + 10, by - h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = shade(color, -0.2);
    ctx.fillRect(ox + 6, by, CELL - 12, 4);
  }
}

/** Atlas do terreno (tiles base + obstáculos). */
export function createTerrainAtlas(scene: Phaser.Scene, key = 'terrain-tiles'): string {
  if (scene.textures.exists(key)) return key;
  const [canvas, ctx] = makeCanvas(TOTAL_TILES * CELL, CELL);
  for (let b = 0; b < BIOMES_ORDER.length; b++)
    for (let c = 0; c < 2; c++)
      for (let s = 0; s < SHADE_LEVELS; s++) {
        const i = baseTileIndex(b, c, s);
        ctx.save();
        ctx.beginPath();
        ctx.rect(i * CELL, 0, CELL, CELL);
        ctx.clip();
        drawBaseTile(ctx, i * CELL, 0, b, c, s);
        ctx.restore();
      }
  for (let k = 1; k <= 3; k++)
    for (let v = 0; v < OBSTACLE_VARIANTS; v++) {
      const i = obstacleTileIndex(k, v);
      ctx.save();
      ctx.beginPath();
      ctx.rect(i * CELL, 0, CELL, CELL);
      ctx.clip();
      drawObstacleTile(ctx, i * CELL, 0, k, v);
      ctx.restore();
    }
  return addCanvasTexture(scene, key, canvas);
}

// ── entidades ──

const SHIELD_PATH = 'M8 20h48v18c0 14-10 22-24 26C18 60 8 52 8 38z';

/** Escudo heráldico na cor do estandarte; forma do topo muda pela era. */
export function cityTexture(scene: Phaser.Scene, colorIndex: number, era: EraId): string {
  const key = `city-${colorIndex}-${era}`;
  if (scene.textures.exists(key)) return key;
  const color = bannerColor(colorIndex);
  const [canvas, ctx] = makeCanvas(TEX, TEX + 8);
  ctx.translate(0, 4);
  // Emblema da era atrás do escudo.
  if (era === 'era_ash') {
    ctx.fillStyle = '#6E4B2A';
    for (let i = 0; i < 7; i++) {
      const x = 6 + i * 8;
      ctx.beginPath();
      ctx.moveTo(x, 26);
      ctx.lineTo(x, 10);
      ctx.lineTo(x + 3.5, 4);
      ctx.lineTo(x + 7, 10);
      ctx.lineTo(x + 7, 26);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#4A3220';
    ctx.fillRect(4, 18, 56, 3);
  } else if (era === 'era_iron') {
    ctx.fillStyle = '#7C7770';
    ctx.fillRect(4, 8, 56, 18);
    ctx.fillStyle = '#5E5A55';
    for (let i = 0; i < 7; i++) ctx.fillRect(4 + i * 8 + (i % 2) * 2, 2, 6, 7);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(4, 15, 56, 1.5);
  } else {
    ctx.fillStyle = '#2B2622';
    ctx.fillRect(22, 4, 20, 22);
    ctx.fillRect(18, 2, 6, 6);
    ctx.fillRect(40, 2, 6, 6);
    ctx.fillStyle = '#E2572B';
    ctx.beginPath();
    ctx.moveTo(32, -4);
    ctx.quadraticCurveTo(40, 4, 32, 10);
    ctx.quadraticCurveTo(24, 4, 32, -4);
    ctx.fill();
    ctx.fillStyle = '#FFC35A';
    ctx.beginPath();
    ctx.arc(32, 6, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  const shield = new Path2D(SHIELD_PATH);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.save();
  ctx.translate(1.5, 2.5);
  ctx.fill(shield);
  ctx.restore();
  const grad = ctx.createLinearGradient(0, 20, 0, 64);
  grad.addColorStop(0, shade(color, 0.18));
  grad.addColorStop(1, shade(color, -0.25));
  ctx.fillStyle = grad;
  ctx.fill(shield);
  // Faixa diagonal + braseiro.
  ctx.save();
  ctx.clip(shield);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.moveTo(8, 20);
  ctx.lineTo(24, 20);
  ctx.lineTo(56, 52);
  ctx.lineTo(56, 64);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#C9A24A';
  ctx.lineWidth = 3;
  ctx.stroke(shield);
  drawIcon(ctx, 'keep', 22, 28, 20, '#F2E6CC');
  return addCanvasTexture(scene, key, canvas);
}

const FACTION_ICON: Record<CampTypeId, IconName> = {
  npc_hollow: 'skull',
  npc_brine: 'drop',
  npc_pale: 'icecrown',
};

/** Estandarte de acampamento em --blood com ícone da facção e o nível. */
export function campTexture(scene: Phaser.Scene, faction: CampTypeId, level: number): string {
  const key = `camp-${faction}-${level}`;
  if (scene.textures.exists(key)) return key;
  const [canvas, ctx] = makeCanvas(TEX, TEX);
  // Mastro.
  ctx.fillStyle = '#3A2E25';
  ctx.fillRect(12, 4, 4, 58);
  ctx.fillStyle = '#C9A24A';
  ctx.beginPath();
  ctx.arc(14, 4, 3.5, 0, Math.PI * 2);
  ctx.fill();
  // Bandeira com rabo de andorinha.
  const flag = new Path2D('M16 8h40v38l-20-8-20 8z');
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.save();
  ctx.translate(2, 2);
  ctx.fill(flag);
  ctx.restore();
  const grad = ctx.createLinearGradient(16, 8, 56, 46);
  grad.addColorStop(0, '#A92323');
  grad.addColorStop(1, '#5E1010');
  ctx.fillStyle = grad;
  ctx.fill(flag);
  ctx.strokeStyle = '#2A0B0B';
  ctx.lineWidth = 2;
  ctx.stroke(flag);
  const iconColor = faction === 'npc_pale' ? '#BFE0F5' : faction === 'npc_brine' ? '#F0E3C4' : '#D9D2C5';
  drawIcon(ctx, FACTION_ICON[faction] ?? 'skull', 24, 13, 24, iconColor);
  // Nível.
  ctx.fillStyle = '#14110F';
  ctx.beginPath();
  ctx.arc(46, 52, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#C9A24A';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#E8DCC4';
  ctx.font = 'bold 13px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(level), 46, 53);
  return addCanvasTexture(scene, key, canvas);
}

/** Nó de recurso: ícone sobre círculo + pontinhos de nível. */
export function nodeTexture(scene: Phaser.Scene, res: ResourceKey, level: number): string {
  const key = `node-${res}-${level}`;
  if (scene.textures.exists(key)) return key;
  const [canvas, ctx] = makeCanvas(TEX, TEX);
  const color = RESOURCE_COLOR[res];
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(32, 52, 20, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1D1916';
  ctx.beginPath();
  ctx.arc(32, 28, 21, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();
  drawIcon(ctx, res, 17, 13, 30, color);
  // Pontinhos de nível.
  const dots = Math.min(6, level);
  const total = dots * 7 - 2;
  for (let i = 0; i < dots; i++) {
    ctx.fillStyle = '#C9A24A';
    ctx.beginPath();
    ctx.arc(32 - total / 2 + i * 7 + 2.5, 57, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  return addCanvasTexture(scene, key, canvas);
}

/** Ponto da marcha. */
export function marchDotTexture(scene: Phaser.Scene, kind: 'mine' | 'other' | 'hostile'): string {
  const key = `march-${kind}`;
  if (scene.textures.exists(key)) return key;
  const color = kind === 'mine' ? '#E2572B' : kind === 'hostile' ? '#D8312A' : '#A89A84';
  const [canvas, ctx] = makeCanvas(32, 32);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.arc(16, 17, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(16, 15, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#14110F';
  ctx.lineWidth = 2;
  ctx.stroke();
  drawIcon(ctx, kind === 'hostile' ? 'sword' : 'flag', 9, 8, 14, '#14110F');
  return addCanvasTexture(scene, key, canvas);
}

/** Anel (escudo ativo / minha cidade). */
export function ringTexture(scene: Phaser.Scene, key: string, color: string, width = 3): string {
  if (scene.textures.exists(key)) return key;
  const [canvas, ctx] = makeCanvas(TEX + 16, TEX + 16);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc((TEX + 16) / 2, (TEX + 16) / 2, TEX / 2 + 2, 0, Math.PI * 2);
  ctx.stroke();
  return addCanvasTexture(scene, key, canvas);
}
