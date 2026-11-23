import * as Phaser from 'phaser';
import type { WorldInfoDto } from '@wn/shared';
import { WORLD_SCENE_KEY, WorldScene } from './scenes/WorldScene';

/** Cria o Phaser.Game uma vez (o PhaserHost mantém vivo fora do /mapa). */
export function createGame(parent: HTMLElement, info: WorldInfoDto): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#0d0b0a',
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: parent.clientWidth || 800,
      height: parent.clientHeight || 600,
    },
    render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
    input: { mouse: { preventDefaultWheel: true }, touch: { capture: true } },
    disableContextMenu: true,
    banner: false,
    audio: { noAudio: true },
    scene: [],
  });
  game.scene.add(WORLD_SCENE_KEY, WorldScene, true, { info });
  return game;
}
