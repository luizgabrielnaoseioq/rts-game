import * as Phaser from 'phaser';
import { MAP_VIEW } from '@wn/shared';

export interface ViewRect {
  /** Em casas. */
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
}

const DRAG_THRESHOLD = 6;
const MIN_ZOOM = MAP_VIEW.minZoom;
const MAX_ZOOM = MAP_VIEW.maxZoom;

/**
 * Câmera: arrastar (mouse e toque, limiar de 6 px), roda e pinça com foco no ponteiro,
 * inércia leve, duplo clique centraliza. Emite viewChanged com debounce.
 */
export class CameraController {
  private cam: Phaser.Cameras.Scene2D.Camera;
  private dragStart: { x: number; y: number; scrollX: number; scrollY: number } | null = null;
  private dragging = false;
  private pinch: { dist: number; zoom: number; midX: number; midY: number } | null = null;
  private velocity = { x: 0, y: 0 };
  private lastMove = { x: 0, y: 0, t: 0 };
  private lastClick = 0;
  private debounce: number | null = null;
  private lastEmit = '';

  constructor(
    private scene: Phaser.Scene,
    private tilePx: number,
    private worldW: number,
    private worldH: number,
    private onView: (v: ViewRect) => void,
    private onClick: (tileX: number, tileY: number) => void,
    private onHover: (tileX: number, tileY: number) => void,
  ) {
    this.cam = scene.cameras.main;
    this.cam.setBounds(-tilePx * 4, -tilePx * 4, worldW + tilePx * 8, worldH + tilePx * 8);
    this.cam.setZoom(1);
    scene.input.addPointer(1);

    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('pointerupoutside', this.onUp, this);
    scene.input.on('wheel', this.onWheel, this);
    scene.scale.on('resize', this.emitSoon, this);
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onDown, this);
    this.scene.input.off('pointermove', this.onMove, this);
    this.scene.input.off('pointerup', this.onUp, this);
    this.scene.input.off('pointerupoutside', this.onUp, this);
    this.scene.input.off('wheel', this.onWheel, this);
    this.scene.scale.off('resize', this.emitSoon, this);
    if (this.debounce != null) window.clearTimeout(this.debounce);
  }

  /** Mundo -> casa sob o ponto da tela. */
  private screenToWorld(px: number, py: number, zoom = this.cam.zoom): { x: number; y: number } {
    const w = this.cam.width;
    const h = this.cam.height;
    return {
      x: this.cam.scrollX + w / 2 + (px - w / 2) / zoom,
      y: this.cam.scrollY + h / 2 + (py - h / 2) / zoom,
    };
  }

  private activePointers(): Phaser.Input.Pointer[] {
    const p = [this.scene.input.pointer1, this.scene.input.pointer2].filter((x): x is Phaser.Input.Pointer => !!x && x.isDown);
    return p;
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    this.velocity = { x: 0, y: 0 };
    const pts = this.activePointers();
    if (pts.length >= 2) {
      const [a, b] = pts;
      this.pinch = {
        dist: Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y),
        zoom: this.cam.zoom,
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
      };
      this.dragStart = null;
      this.dragging = true;
      return;
    }
    this.dragStart = { x: pointer.x, y: pointer.y, scrollX: this.cam.scrollX, scrollY: this.cam.scrollY };
    this.dragging = false;
    this.lastMove = { x: pointer.x, y: pointer.y, t: performance.now() };
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    if (this.pinch) {
      const pts = this.activePointers();
      if (pts.length >= 2) {
        const [a, b] = pts;
        const dist = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        this.zoomAt(this.pinch.zoom * (dist / Math.max(1, this.pinch.dist)), midX, midY);
        // Arrasta junto com o ponto médio.
        this.cam.scrollX -= (midX - this.pinch.midX) / this.cam.zoom;
        this.cam.scrollY -= (midY - this.pinch.midY) / this.cam.zoom;
        this.pinch.midX = midX;
        this.pinch.midY = midY;
        this.emitSoon();
      }
      return;
    }
    if (this.dragStart && pointer.isDown) {
      const dx = pointer.x - this.dragStart.x;
      const dy = pointer.y - this.dragStart.y;
      if (!this.dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) this.dragging = true;
      if (this.dragging) {
        this.cam.scrollX = this.dragStart.scrollX - dx / this.cam.zoom;
        this.cam.scrollY = this.dragStart.scrollY - dy / this.cam.zoom;
        const now = performance.now();
        const dt = Math.max(1, now - this.lastMove.t);
        this.velocity = {
          x: (-(pointer.x - this.lastMove.x) / this.cam.zoom / dt) * 16,
          y: (-(pointer.y - this.lastMove.y) / this.cam.zoom / dt) * 16,
        };
        this.lastMove = { x: pointer.x, y: pointer.y, t: now };
        this.emitSoon();
      }
      return;
    }
    const w = this.screenToWorld(pointer.x, pointer.y);
    this.onHover(Math.floor(w.x / this.tilePx), Math.floor(w.y / this.tilePx));
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    if (this.pinch) {
      if (this.activePointers().length < 2) this.pinch = null;
      this.dragStart = null;
      this.velocity = { x: 0, y: 0 };
      return;
    }
    // Só é clique no mapa se o pointerdown foi no canvas (mouseup em cima da HUD React também chega aqui).
    if (!this.dragStart) return;
    const wasDragging = this.dragging;
    this.dragStart = null;
    this.dragging = false;
    if (wasDragging) {
      // Inércia só se o último movimento foi recente.
      if (performance.now() - this.lastMove.t > 80) this.velocity = { x: 0, y: 0 };
      return;
    }
    this.velocity = { x: 0, y: 0 };
    const w = this.screenToWorld(pointer.x, pointer.y);
    const tx = Math.floor(w.x / this.tilePx);
    const ty = Math.floor(w.y / this.tilePx);
    const now = performance.now();
    if (now - this.lastClick < 300) {
      this.panTo(w.x, w.y);
      this.lastClick = 0;
      return;
    }
    this.lastClick = now;
    if (tx >= 0 && ty >= 0 && tx * this.tilePx < this.worldW && ty * this.tilePx < this.worldH) this.onClick(tx, ty);
  }

  private onWheel(pointer: Phaser.Input.Pointer, _objs: unknown, _dx: number, dy: number): void {
    const factor = Math.pow(1.0015, -dy);
    this.zoomAt(this.cam.zoom * factor, pointer.x, pointer.y);
    this.emitSoon();
  }

  /** Zoom mantendo fixo o ponto do mundo sob (px, py). */
  zoomAt(zoom: number, px: number, py: number): void {
    const z = Phaser.Math.Clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    const before = this.screenToWorld(px, py);
    this.cam.setZoom(z);
    const w = this.cam.width;
    const h = this.cam.height;
    this.cam.scrollX = before.x - w / 2 - (px - w / 2) / z;
    this.cam.scrollY = before.y - h / 2 - (py - h / 2) / z;
  }

  /** Centraliza num ponto do mundo (px). */
  panTo(x: number, y: number, duration = 450): void {
    this.velocity = { x: 0, y: 0 };
    this.cam.pan(x, y, duration, 'Sine.easeInOut', true, (_c: Phaser.Cameras.Scene2D.Camera, progress: number) => {
      if (progress >= 1) this.emitSoon();
    });
  }

  centerOn(x: number, y: number): void {
    this.cam.centerOn(x, y);
    this.emitSoon();
  }

  update(): void {
    if (!this.dragStart && !this.pinch && (Math.abs(this.velocity.x) > 0.05 || Math.abs(this.velocity.y) > 0.05)) {
      this.cam.scrollX += this.velocity.x;
      this.cam.scrollY += this.velocity.y;
      this.velocity.x *= 0.9;
      this.velocity.y *= 0.9;
      this.emitSoon();
    }
  }

  view(): ViewRect {
    // Calculado da câmera (o worldView só é atualizado no render e vem zerado antes do 1º frame).
    const z = this.cam.zoom;
    const w = this.cam.width / z;
    const h = this.cam.height / z;
    const x = this.cam.scrollX + this.cam.width / 2 - w / 2;
    const y = this.cam.scrollY + this.cam.height / 2 - h / 2;
    return { x: x / this.tilePx, y: y / this.tilePx, width: w / this.tilePx, height: h / this.tilePx, zoom: z };
  }

  emitSoon(): void {
    if (this.debounce != null) window.clearTimeout(this.debounce);
    this.debounce = window.setTimeout(() => {
      this.debounce = null;
      const v = this.view();
      const sig = `${v.x.toFixed(1)}:${v.y.toFixed(1)}:${v.width.toFixed(1)}:${v.zoom.toFixed(3)}`;
      if (sig === this.lastEmit) return;
      this.lastEmit = sig;
      this.onView(v);
    }, 150);
  }
}
