import * as Phaser from 'phaser';
import type { Id, MapCityDto, MapNpcCampDto, MapResourceNodeDto } from '@wn/shared';
import { useAuthStore } from '../../stores/auth';
import { useWorldStore } from '../../stores/world';
import { campTexture, cityTexture, nodeTexture, ringTexture } from '../textures';

type Entity = MapCityDto | MapResourceNodeDto | MapNpcCampDto;

interface Sprite<T extends Entity> {
  data: T;
  container: Phaser.GameObjects.Container;
  label?: Phaser.GameObjects.Text;
  ring?: Phaser.GameObjects.Image;
}

const LABEL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: '11px',
  color: '#E8DCC4',
  stroke: '#14110F',
  strokeThickness: 3,
  align: 'center',
};

/** Cidades, nós e acampamentos (store -> sprites, sem React). */
export class EntityLayer {
  private cities = new Map<Id, Sprite<MapCityDto>>();
  private nodes = new Map<Id, Sprite<MapResourceNodeDto>>();
  private camps = new Map<Id, Sprite<MapNpcCampDto>>();
  private group: Phaser.GameObjects.Layer;
  private unsub: () => void;
  private labelsVisible = true;
  private myCityRing: Phaser.Tweens.Tween | null = null;

  constructor(
    private scene: Phaser.Scene,
    private tilePx: number,
  ) {
    this.group = scene.add.layer();
    this.group.setDepth(10);
    ringTexture(scene, 'ring-shield', '#C9A24A', 3);
    ringTexture(scene, 'ring-mine', '#E2572B', 4);
    this.sync();
    this.unsub = useWorldStore.subscribe((s, prev) => {
      if (s.cities !== prev.cities || s.nodes !== prev.nodes || s.camps !== prev.camps) this.sync();
    });
  }

  destroy(): void {
    this.unsub();
    this.myCityRing?.remove();
    this.group.destroy();
  }

  private center(x: number, y: number): [number, number] {
    return [(x + 0.5) * this.tilePx, (y + 0.5) * this.tilePx];
  }

  private sync(): void {
    const s = useWorldStore.getState();
    this.diff(this.cities, s.cities, (e) => this.makeCity(e), (sp, e) => this.updateCity(sp, e));
    this.diff(this.nodes, s.nodes, (e) => this.makeNode(e), (sp, e) => this.updateNode(sp, e));
    this.diff(this.camps, s.camps, (e) => this.makeCamp(e), (sp, e) => this.updateCamp(sp, e));
  }

  private diff<T extends Entity>(
    current: Map<Id, Sprite<T>>,
    next: Record<Id, T>,
    make: (e: T) => Sprite<T>,
    update: (sp: Sprite<T>, e: T) => void,
  ): void {
    for (const [id, sp] of current) {
      if (!next[id]) {
        sp.container.destroy();
        current.delete(id);
      }
    }
    for (const [id, e] of Object.entries(next)) {
      const sp = current.get(id);
      if (!sp) current.set(id, make(e));
      else if (sp.data !== e) update(sp, e);
    }
  }

  // ── cidades ──

  private makeCity(e: MapCityDto): Sprite<MapCityDto> {
    const [cx, cy] = this.center(e.x, e.y);
    const container = this.scene.add.container(cx, cy);
    this.group.add(container);
    const sp: Sprite<MapCityDto> = { data: e, container };
    this.buildCity(sp, e);
    return sp;
  }

  private buildCity(sp: Sprite<MapCityDto>, e: MapCityDto): void {
    sp.container.removeAll(true);
    sp.data = e;
    const t = this.tilePx;
    const isMine = e.ownerId === useAuthStore.getState().player?.id;
    if (isMine) {
      const ring = this.scene.add.image(0, 0, 'ring-mine').setDisplaySize(t * 1.9, t * 1.9);
      sp.container.add(ring);
      this.myCityRing?.remove();
      this.myCityRing = this.scene.tweens.add({ targets: ring, alpha: { from: 1, to: 0.35 }, duration: 1100, yoyo: true, repeat: -1 });
    }
    if (e.shielded) {
      sp.ring = this.scene.add.image(0, 0, 'ring-shield').setDisplaySize(t * 1.6, t * 1.6);
      sp.container.add(sp.ring);
    }
    const img = this.scene.add.image(0, -t * 0.1, cityTexture(this.scene, e.bannerColor, e.era));
    img.setDisplaySize(t * 1.3, t * 1.3 * ((64 + 8) / 64));
    sp.container.add(img);
    sp.label = this.scene.add
      .text(0, t * 0.62, `${e.name}\nNv ${e.level} · ${e.ownerName}`, {
        ...LABEL_STYLE,
        color: isMine ? '#F0B07A' : '#E8DCC4',
      })
      .setOrigin(0.5, 0)
      .setResolution(2)
      .setVisible(this.labelsVisible);
    sp.container.add(sp.label);
    sp.container.setDepth(isMine ? 3 : 2);
  }

  private updateCity(sp: Sprite<MapCityDto>, e: MapCityDto): void {
    const [cx, cy] = this.center(e.x, e.y);
    sp.container.setPosition(cx, cy);
    this.buildCity(sp, e);
  }

  // ── nós ──

  private makeNode(e: MapResourceNodeDto): Sprite<MapResourceNodeDto> {
    const [cx, cy] = this.center(e.x, e.y);
    const container = this.scene.add.container(cx, cy);
    this.group.add(container);
    const sp: Sprite<MapResourceNodeDto> = { data: e, container };
    this.buildNode(sp, e);
    return sp;
  }

  private buildNode(sp: Sprite<MapResourceNodeDto>, e: MapResourceNodeDto): void {
    sp.container.removeAll(true);
    sp.data = e;
    const t = this.tilePx;
    const img = this.scene.add.image(0, 0, nodeTexture(this.scene, e.resourceType, e.level)).setDisplaySize(t * 0.95, t * 0.95);
    const depleted = e.status === 'DEPLETED';
    img.setAlpha(depleted ? 0.3 : 1);
    sp.container.add(img);
    if (e.occupiedByPlayerName && !depleted) {
      const flag = this.scene.add.circle(t * 0.32, -t * 0.32, t * 0.11, 0xe2572b).setStrokeStyle(1.5, 0x14110f);
      sp.container.add(flag);
    }
    sp.container.setDepth(1);
  }

  private updateNode(sp: Sprite<MapResourceNodeDto>, e: MapResourceNodeDto): void {
    const [cx, cy] = this.center(e.x, e.y);
    sp.container.setPosition(cx, cy);
    this.buildNode(sp, e);
  }

  // ── acampamentos ──

  private makeCamp(e: MapNpcCampDto): Sprite<MapNpcCampDto> {
    const [cx, cy] = this.center(e.x, e.y);
    const container = this.scene.add.container(cx, cy);
    this.group.add(container);
    const sp: Sprite<MapNpcCampDto> = { data: e, container };
    this.buildCamp(sp, e);
    return sp;
  }

  private buildCamp(sp: Sprite<MapNpcCampDto>, e: MapNpcCampDto): void {
    sp.container.removeAll(true);
    sp.data = e;
    const t = this.tilePx;
    const defeated = e.status === 'DEFEATED';
    const img = this.scene.add.image(0, -t * 0.05, campTexture(this.scene, e.campTypeId, e.level)).setDisplaySize(t * 1.05, t * 1.05);
    img.setAlpha(defeated ? 0.28 : 1);
    sp.container.add(img);
    if (!defeated && e.healthRatio < 0.999) {
      // Barra de vida (o acampamento foi ferido).
      const w = t * 0.8;
      const bg = this.scene.add.rectangle(0, t * 0.5, w, 3, 0x14110f).setOrigin(0.5);
      const fg = this.scene.add
        .rectangle(-w / 2, t * 0.5, w * Math.max(0, e.healthRatio), 3, 0x8e1b1b)
        .setOrigin(0, 0.5);
      sp.container.add([bg, fg]);
    }
    sp.container.setDepth(1);
  }

  private updateCamp(sp: Sprite<MapNpcCampDto>, e: MapNpcCampDto): void {
    const [cx, cy] = this.center(e.x, e.y);
    sp.container.setPosition(cx, cy);
    this.buildCamp(sp, e);
  }

  /** Nomes só a partir de um zoom legível. */
  update(zoom: number): void {
    const show = zoom >= 0.75;
    if (show === this.labelsVisible) return;
    this.labelsVisible = show;
    for (const sp of this.cities.values()) sp.label?.setVisible(show);
  }
}
