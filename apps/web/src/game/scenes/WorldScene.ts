import * as Phaser from 'phaser';
import { BIOMES_ORDER, MAP_VIEW, generateTerrain, type WorldInfoDto } from '@wn/shared';
import { useCityStore } from '../../stores/city';
import { useUiStore } from '../../stores/ui';
import { CameraController } from '../systems/CameraController';
import { ChunkManager } from '../systems/ChunkManager';
import { EntityLayer } from '../systems/EntityLayer';
import { MarchLayer } from '../systems/MarchLayer';
import {
  ATLAS_MARGIN,
  ATLAS_SPACING,
  OBSTACLE_VARIANTS,
  SHADE_LEVELS,
  TEX,
  baseTileIndex,
  createTerrainAtlas,
  obstacleTileIndex,
} from '../textures';

export const WORLD_SCENE_KEY = 'world';

/** Mapa do mundo: terreno pela seed + entidades por chunk + marchas interpoladas. */
export class WorldScene extends Phaser.Scene {
  private info!: WorldInfoDto;
  private tilePx = MAP_VIEW.tilePx;
  private camCtl!: CameraController;
  private chunks!: ChunkManager;
  private entities!: EntityLayer;
  private marches!: MarchLayer;
  private selection!: Phaser.GameObjects.Graphics;
  private hover!: Phaser.GameObjects.Graphics;
  private unsubs: (() => void)[] = [];
  private lastHover = '';
  private viewThrottle = 0;

  constructor() {
    super(WORLD_SCENE_KEY);
  }

  init(data: { info: WorldInfoDto }): void {
    this.info = data.info;
  }

  create(): void {
    const { seed, width, height, chunkSize } = this.info;
    const t = this.tilePx;
    const worldW = width * t;
    const worldH = height * t;
    this.cameras.main.setBackgroundColor('#0d0b0a');

    this.buildTerrain(seed, width, height);

    this.entities = new EntityLayer(this, t);
    this.marches = new MarchLayer(this, t);
    this.selection = this.add.graphics().setDepth(30);
    this.hover = this.add.graphics().setDepth(29);

    this.chunks = new ChunkManager(chunkSize, width, height);
    this.camCtl = new CameraController(
      this,
      t,
      worldW,
      worldH,
      (v) => {
        this.chunks.onView(v);
        useUiStore.getState().setCameraView(v);
      },
      (x, y) => useUiStore.getState().selectTile(x, y),
      (x, y) => this.setHover(x, y),
    );

    // Câmera inicial: minha cidade (ou o centro do mundo).
    const city = useCityStore.getState().city;
    if (city) this.camCtl.centerOn((city.x + 0.5) * t, (city.y + 0.5) * t);
    else {
      this.camCtl.centerOn(worldW / 2, worldH / 2);
      const unsub = useCityStore.subscribe((s) => {
        if (s.city) {
          this.camCtl.centerOn((s.city.x + 0.5) * t, (s.city.y + 0.5) * t);
          unsub();
        }
      });
      this.unsubs.push(unsub);
    }

    // Pedido de foco feito antes da cena existir (ex.: clique no ranking).
    const pending = useUiStore.getState().focus;
    if (pending) this.camCtl.centerOn((pending.x + 0.5) * t, (pending.y + 0.5) * t);

    // React -> cena: foco de câmera e seleção.
    this.unsubs.push(
      useUiStore.subscribe((s, prev) => {
        if (s.focus && s.focus !== prev.focus) {
          this.camCtl.panTo((s.focus.x + 0.5) * t, (s.focus.y + 0.5) * t);
          if (s.focus.select) useUiStore.getState().selectTile(s.focus.x, s.focus.y);
        }
        if (s.selectedTile !== prev.selectedTile) this.drawSelection();
      }),
    );
    this.drawSelection();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanup());
  }

  private cleanup(): void {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.camCtl?.destroy();
    this.chunks?.destroy();
    this.entities?.destroy();
    this.marches?.destroy();
  }

  /** Tilemap único (14.400 casas) gerado pela seed + linha nas fronteiras de bioma. */
  private buildTerrain(seed: string, width: number, height: number): void {
    const terrain = generateTerrain(seed, width, height);
    createTerrainAtlas(this, 'terrain-tiles');

    const data: number[][] = [];
    for (let y = 0; y < height; y++) {
      const row: number[] = [];
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const shadeLevel = Math.min(SHADE_LEVELS - 1, Math.floor((terrain.shade[i] / 256) * SHADE_LEVELS));
        row.push(baseTileIndex(terrain.biome[i], (x + y) & 1, shadeLevel));
      }
      data.push(row);
    }
    const map = this.make.tilemap({ data, tileWidth: TEX, tileHeight: TEX });
    const tileset = map.addTilesetImage('terrain', 'terrain-tiles', TEX, TEX, ATLAS_MARGIN, ATLAS_SPACING);
    if (!tileset) throw new Error('Tileset do terreno não carregou');
    const scale = this.tilePx / TEX;
    const ground = map.createLayer(0, tileset, 0, 0);
    ground?.setScale(scale).setDepth(0);

    const obstacles = map.createBlankLayer('obstacles', tileset, 0, 0, width, height, TEX, TEX);
    if (obstacles) {
      obstacles.setScale(scale).setDepth(1);
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const kind = terrain.obstacle[y * width + x];
          if (kind === 0) continue;
          const variant = (terrain.shade[y * width + x] + x * 7 + y * 13) % OBSTACLE_VARIANTS;
          obstacles.putTileAt(obstacleTileIndex(kind, variant), x, y);
        }
    }

    // Fronteiras de bioma (bandas por latitude) e borda do mundo.
    const g = this.add.graphics().setDepth(2);
    const t = this.tilePx;
    g.lineStyle(2, 0x000000, 0.35);
    for (let y = 1; y < height; y++) {
      const a = terrain.biome[(y - 1) * width];
      const b = terrain.biome[y * width];
      if (a !== b) g.lineBetween(0, y * t, width * t, y * t);
    }
    g.lineStyle(4, 0x4a3f35, 1);
    g.strokeRect(0, 0, width * t, height * t);
    // Garante que BIOMES_ORDER e o atlas estejam em sincronia (3 biomas).
    if (BIOMES_ORDER.length !== 3) console.warn('[terreno] número de biomas mudou; revise o atlas');
  }

  private setHover(x: number, y: number): void {
    const key = `${x}:${y}`;
    if (key === this.lastHover) return;
    this.lastHover = key;
    const inside = x >= 0 && y >= 0 && x < this.info.width && y < this.info.height;
    useUiStore.getState().setHoverTile(inside ? { x, y } : null);
    const t = this.tilePx;
    this.hover.clear();
    if (inside) {
      this.hover.lineStyle(1.5, 0xe8dcc4, 0.35);
      this.hover.strokeRect(x * t, y * t, t, t);
    }
  }

  private drawSelection(): void {
    const sel = useUiStore.getState().selectedTile;
    const t = this.tilePx;
    this.selection.clear();
    if (!sel) return;
    this.selection.lineStyle(2.5, 0xc9a24a, 1);
    this.selection.strokeRect(sel.x * t + 1, sel.y * t + 1, t - 2, t - 2);
    // Cantos de mira.
    const c = t * 0.3;
    this.selection.lineStyle(3, 0xe2572b, 1);
    const x0 = sel.x * t - 3;
    const y0 = sel.y * t - 3;
    const x1 = (sel.x + 1) * t + 3;
    const y1 = (sel.y + 1) * t + 3;
    this.selection.lineBetween(x0, y0, x0 + c, y0).lineBetween(x0, y0, x0, y0 + c);
    this.selection.lineBetween(x1, y0, x1 - c, y0).lineBetween(x1, y0, x1, y0 + c);
    this.selection.lineBetween(x0, y1, x0 + c, y1).lineBetween(x0, y1, x0, y1 - c);
    this.selection.lineBetween(x1, y1, x1 - c, y1).lineBetween(x1, y1, x1, y1 - c);
  }

  update(time: number): void {
    const zoom = this.cameras.main.zoom;
    this.camCtl.update();
    this.entities.update(zoom);
    this.marches.update(zoom);
    // Minimapa acompanha a câmera (~8 vezes/s).
    if (time - this.viewThrottle > 120) {
      this.viewThrottle = time;
      const v = this.camCtl.view();
      const cur = useUiStore.getState().cameraView;
      if (!cur || Math.abs(cur.x - v.x) > 0.05 || Math.abs(cur.y - v.y) > 0.05 || cur.zoom !== v.zoom) {
        useUiStore.getState().setCameraView(v);
      }
    }
  }
}
