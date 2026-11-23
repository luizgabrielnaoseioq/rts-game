import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BIOMES,
  BIOMES_ORDER,
  OBSTACLES,
  OBSTACLE_CODES,
  generateTerrain,
  positionAt,
  sumResources,
  type MarchDto,
} from '@wn/shared';
import { api } from '../api/endpoints';
import { describeError } from '../api/http';
import { MARCH_STATE_LABEL, MARCH_TYPE_LABEL } from '../i18n/labels';
import { fmtCoord, fmtInt, fmtShort } from '../lib/format';
import { useServerNow } from '../lib/hooks';
import { useCityStore } from '../stores/city';
import { useMarchStore } from '../stores/marches';
import { toast, useUiStore } from '../stores/ui';
import { useWorldStore } from '../stores/world';
import { Countdown } from './common';
import { Icon } from './icons';

function MarchRow({ m }: { m: MarchDto }) {
  const focusOn = useUiStore((s) => s.focusOn);
  const now = useServerNow(1000);
  const [busy, setBusy] = useState(false);
  const recallable = m.state === 'OUTBOUND' || m.state === 'GATHERING' || m.state === 'STATIONED';
  const alive = m.troops.reduce((s, t) => s + t.alive, 0);
  const loot = sumResources(m.loot);
  const endsAt = m.state === 'GATHERING' && m.gatherEndsAt ? m.gatherEndsAt : m.state === 'STATIONED' ? null : m.legEndAt;
  const startsAt = m.state === 'GATHERING' ? m.legEndAt : m.legStartAt;

  const recall = async () => {
    setBusy(true);
    try {
      const r = await api.recall(m.id);
      useMarchStore.getState().upsertMine(r);
      toast({ kind: 'info', title: 'Marcha chamada de volta' });
    } catch (e) {
      toast({ kind: 'danger', title: 'Não deu para chamar de volta', body: describeError(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={`march-row state-${m.state.toLowerCase()}`}>
      <div className="march-row-head">
        <Icon name={m.type === 'GATHER' ? 'flag' : 'sword'} size={15} />
        <strong>{MARCH_TYPE_LABEL[m.type]}</strong>
        <span className="tag">{MARCH_STATE_LABEL[m.state]}</span>
      </div>
      <div className="muted small">
        {fmtCoord(m.targetX, m.targetY)} · {fmtInt(alive)} tropas
        {loot > 0 ? ` · saque ${fmtShort(loot)}` : ''}
      </div>
      {endsAt && <Countdown endsAt={endsAt} startsAt={startsAt} bar />}
      <div className="march-row-actions">
        <button
          className="btn tiny ghost"
          onClick={() => {
            const p = positionAt(m, now);
            focusOn(Math.round(p.x), Math.round(p.y), false);
          }}
        >
          <Icon name="target" size={13} /> Ver
        </button>
        {recallable && (
          <button className="btn tiny" disabled={busy} onClick={() => void recall()}>
            <Icon name="recall" size={13} /> Voltar
          </button>
        )}
      </div>
    </li>
  );
}

/** Lista das minhas marchas com recall. */
export function MarchList() {
  const mine = useMarchStore((s) => s.mine);
  const slots = useCityStore((s) => s.city?.marchSlots);
  const [open, setOpen] = useState(true);
  const list = useMemo(() => Object.values(mine).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [mine]);
  return (
    <aside className={`march-list panel${open ? '' : ' collapsed'}`}>
      <header onClick={() => setOpen((o) => !o)} role="button" tabIndex={0}>
        <Icon name="flag" size={16} />
        <strong>Marchas</strong>
        <span className="muted small">
          {slots ? `${slots.active}/${slots.max}` : list.length}
        </span>
        <span className="grow" />
        <span className="muted small">{open ? '▾' : '▸'}</span>
      </header>
      {open && (
        <ul>
          {list.length === 0 && <li className="muted small empty-row">Nenhuma marcha. Clique num nó ou acampamento no mapa.</li>}
          {list.map((m) => (
            <MarchRow key={m.id} m={m} />
          ))}
        </ul>
      )}
    </aside>
  );
}

/** Minimapa com os 3 biomas, minha cidade e o retângulo da câmera. */
export function Minimap() {
  const info = useWorldStore((s) => s.info);
  const city = useCityStore((s) => s.city);
  const view = useUiStore((s) => s.cameraView);
  const focusOn = useUiStore((s) => s.focusOn);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const SIZE = 150;

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !info) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const terrain = generateTerrain(info.seed, info.width, info.height);
    const img = ctx.createImageData(info.width, info.height);
    const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const biomeRgb = BIOMES_ORDER.map((b) => rgb(BIOMES[b].colors[0]));
    for (let i = 0; i < terrain.biome.length; i++) {
      const obs = OBSTACLE_CODES[terrain.obstacle[i]];
      const [r, g, b] = obs ? rgb(OBSTACLES[obs].color) : biomeRgb[terrain.biome[i]];
      const k = (terrain.shade[i] / 255 - 0.5) * 18;
      img.data[i * 4] = r + k;
      img.data[i * 4 + 1] = g + k;
      img.data[i * 4 + 2] = b + k;
      img.data[i * 4 + 3] = 255;
    }
    const tmp = document.createElement('canvas');
    tmp.width = info.width;
    tmp.height = info.height;
    tmp.getContext('2d')?.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, SIZE, SIZE);
    if (city) {
      const s = SIZE / info.width;
      ctx.fillStyle = '#E2572B';
      ctx.strokeStyle = '#14110F';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc((city.x + 0.5) * s, (city.y + 0.5) * s, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }, [info, city?.x, city?.y]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!info) return null;
  const s = SIZE / info.width;
  return (
    <div className="minimap panel">
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          focusOn(Math.floor((e.clientX - r.left) / s), Math.floor((e.clientY - r.top) / s), false);
        }}
      />
      {view && (
        <span
          className="minimap-view"
          style={{
            left: Math.max(0, view.x * s),
            top: Math.max(0, view.y * s),
            width: Math.min(SIZE, view.width * s),
            height: Math.min(SIZE, view.height * s),
          }}
        />
      )}
    </div>
  );
}
