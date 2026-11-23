import { useEffect, useRef } from 'react';
import type * as PhaserNS from 'phaser';
import { useWorldStore } from '../stores/world';

/**
 * Monta o Phaser.Game uma vez dentro do GameLayout (ARQUITETURA 6.2).
 * Fora do /mapa só fica escondido e com o loop dormindo (mantém câmera e cache de chunks).
 * O Phaser é carregado sob demanda (import dinâmico) para não pesar o login.
 */
export function PhaserHost({ active }: { active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const gameRef = useRef<PhaserNS.Game | null>(null);
  const info = useWorldStore((s) => s.info);
  const activeRef = useRef(active);
  activeRef.current = active;

  // Cria o jogo quando o WorldInfo chegar e o mapa for aberto pela primeira vez.
  const shouldCreate = !!info && active;
  useEffect(() => {
    if (!shouldCreate || !info || !ref.current || gameRef.current) return;
    let cancelled = false;
    const parent = ref.current;
    void import('./createGame').then(({ createGame }) => {
      if (cancelled || gameRef.current) return;
      gameRef.current = createGame(parent, info);
      if (!activeRef.current) gameRef.current.loop.sleep();
    });
    return () => {
      cancelled = true;
    };
  }, [shouldCreate, info]);

  useEffect(
    () => () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    },
    [],
  );

  useEffect(() => {
    const g = gameRef.current;
    if (!g) return;
    if (active) {
      g.loop.wake();
      g.scale.refresh();
    } else {
      g.loop.sleep();
    }
  }, [active]);

  return <div ref={ref} className={`phaser-host${active ? ' active' : ''}`} />;
}
