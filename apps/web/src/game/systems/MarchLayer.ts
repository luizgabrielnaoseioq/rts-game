import * as Phaser from 'phaser';
import { positionAt, type Id, type MapMarchDto } from '@wn/shared';
import { useCityStore } from '../../stores/city';
import { serverNow } from '../../stores/clock';
import { useMarchStore } from '../../stores/marches';
import { marchDotTexture } from '../textures';

const COLORS = { mine: 0xe2572b, other: 0xa89a84, hostile: 0xd8312a } as const;

/**
 * Linhas tracejadas origem -> alvo e o ponto da marcha interpolado a cada frame
 * com positionAt(perna, serverNow()) (ARQUITETURA 5.8).
 */
export class MarchLayer {
  private gfx: Phaser.GameObjects.Graphics;
  private dots = new Map<Id, Phaser.GameObjects.Image>();

  constructor(
    private scene: Phaser.Scene,
    private tilePx: number,
  ) {
    this.gfx = scene.add.graphics().setDepth(20);
    marchDotTexture(scene, 'mine');
    marchDotTexture(scene, 'other');
    marchDotTexture(scene, 'hostile');
  }

  destroy(): void {
    this.gfx.destroy();
    for (const d of this.dots.values()) d.destroy();
    this.dots.clear();
  }

  private kindOf(m: MapMarchDto): 'mine' | 'other' | 'hostile' {
    if (m.isMine) return 'mine';
    const city = useCityStore.getState().city;
    if (city && m.type === 'ATTACK_PLAYER' && m.state === 'OUTBOUND' && m.toX === city.x && m.toY === city.y) return 'hostile';
    return 'other';
  }

  private dashed(x1: number, y1: number, x2: number, y2: number, dash: number, gap: number): void {
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 1) return;
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    for (let d = 0; d < len; d += dash + gap) {
      const e = Math.min(len, d + dash);
      this.gfx.lineBetween(x1 + ux * d, y1 + uy * d, x1 + ux * e, y1 + uy * e);
    }
  }

  update(zoom: number): void {
    const marches = useMarchStore.getState().map;
    const now = serverNow();
    const t = this.tilePx;
    const blink = 0.55 + 0.45 * Math.sin(now / 160);
    this.gfx.clear();

    const seen = new Set<Id>();
    for (const m of Object.values(marches)) {
      seen.add(m.id);
      const kind = this.kindOf(m);
      const color = COLORS[kind];
      const fx = (m.fromX + 0.5) * t;
      const fy = (m.fromY + 0.5) * t;
      const tx = (m.toX + 0.5) * t;
      const ty = (m.toY + 0.5) * t;
      const p = positionAt(m, now);
      const px = (p.x + 0.5) * t;
      const py = (p.y + 0.5) * t;

      const width = Math.max(1.5, 2.5 / zoom);
      const alpha = kind === 'hostile' ? blink : kind === 'mine' ? 0.95 : 0.6;
      // Trecho já andado mais apagado; o que falta, tracejado forte.
      this.gfx.lineStyle(width, color, alpha * 0.35);
      this.dashed(fx, fy, px, py, 6, 6);
      this.gfx.lineStyle(width, color, alpha);
      this.dashed(px, py, tx, ty, 8, 5);
      if (m.state === 'OUTBOUND' || m.state === 'RETURNING') {
        this.gfx.strokeCircle(tx, ty, t * 0.42);
      }

      let dot = this.dots.get(m.id);
      const key = `march-${kind}`;
      if (!dot) {
        dot = this.scene.add.image(px, py, key).setDepth(21);
        this.dots.set(m.id, dot);
      } else if (dot.texture.key !== key) {
        dot.setTexture(key);
      }
      // Tamanho constante na tela (fica legível no zoom 0,5).
      const size = Math.max(t * 0.55, 18 / zoom);
      dot.setDisplaySize(size, size);
      dot.setPosition(px, py);
      dot.setAlpha(kind === 'hostile' ? 0.6 + 0.4 * blink : 1);
      if (m.state === 'GATHERING' || m.state === 'STATIONED') {
        dot.setScale(dot.scaleX * (1 + 0.08 * Math.sin(now / 300)));
      }
    }
    for (const [id, dot] of this.dots) {
      if (!seen.has(id)) {
        dot.destroy();
        this.dots.delete(id);
      }
    }
  }
}
