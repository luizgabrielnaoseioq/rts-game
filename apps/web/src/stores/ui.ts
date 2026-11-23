import type { MarchType } from '@wn/shared';
import { create } from 'zustand';

export interface Toast {
  id: number;
  kind: 'info' | 'ok' | 'warn' | 'danger';
  title: string;
  body?: string;
  /** Rota para abrir ao clicar. */
  href?: string;
}

export interface MarchDraft {
  type: MarchType;
  targetX: number;
  targetY: number;
  /** Rótulo do alvo para o título do diálogo. */
  targetLabel: string;
  /** Poder recomendado (acampamento), se houver. */
  recommendedPower?: number | null;
}

export interface CameraView {
  /** Retângulo visível em casas. */
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
}

interface UiStore {
  selectedTile: { x: number; y: number; seq: number } | null;
  /** Pedido de câmera do React para a cena (seq muda a cada pedido). */
  focus: { x: number; y: number; seq: number; select: boolean } | null;
  cameraView: CameraView | null;
  hoverTile: { x: number; y: number } | null;
  marchDraft: MarchDraft | null;
  toasts: Toast[];
  /** Aviso de versão de config divergente. */
  configMismatch: boolean;
  socketConnected: boolean;
  selectTile: (x: number, y: number) => void;
  clearSelection: () => void;
  /** select=false só move a câmera (minimapa). */
  focusOn: (x: number, y: number, select?: boolean) => void;
  setCameraView: (v: CameraView) => void;
  setHoverTile: (t: { x: number; y: number } | null) => void;
  openMarch: (d: MarchDraft) => void;
  closeMarch: () => void;
  pushToast: (t: Omit<Toast, 'id'>, ttlMs?: number) => void;
  dismissToast: (id: number) => void;
  setConfigMismatch: (v: boolean) => void;
  setSocketConnected: (v: boolean) => void;
}

let seq = 0;

export const useUiStore = create<UiStore>()((set, get) => ({
  selectedTile: null,
  focus: null,
  cameraView: null,
  hoverTile: null,
  marchDraft: null,
  toasts: [],
  configMismatch: false,
  socketConnected: false,
  selectTile: (x, y) => set({ selectedTile: { x, y, seq: ++seq } }),
  clearSelection: () => set({ selectedTile: null }),
  focusOn: (x, y, select = true) => set({ focus: { x, y, seq: ++seq, select } }),
  setCameraView: (v) => set({ cameraView: v }),
  setHoverTile: (t) => set({ hoverTile: t }),
  openMarch: (d) => set({ marchDraft: d }),
  closeMarch: () => set({ marchDraft: null }),
  pushToast: (t, ttlMs = 6000) => {
    const id = ++seq;
    // No máximo 5 na tela.
    set((s) => ({ toasts: [...s.toasts.slice(-4), { ...t, id }] }));
    window.setTimeout(() => get().dismissToast(id), ttlMs);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setConfigMismatch: (v) => set({ configMismatch: v }),
  setSocketConnected: (v) => set({ socketConnected: v }),
}));

export const toast = (t: Omit<Toast, 'id'>, ttlMs?: number) => useUiStore.getState().pushToast(t, ttlMs);
