import { useState } from 'react';
import {
  ITEMS,
  QUEUES,
  RESOURCE_KEYS,
  TIERS,
  TROOPS,
  TROOP_IDS,
  healingCost,
  healingDurationMs,
  isTroopUnlocked,
  maxBatch,
  trainingCost,
  trainingDurationMs,
  type ItemId,
  type Resources,
  type SpeedupTarget,
  type TrainingJobDto,
  type TroopTypeId,
} from '@wn/shared';
import { api } from '../api/endpoints';
import { describeError } from '../api/http';
import { itemName, troopName } from '../i18n/labels';
import { fmtDuration, fmtInt } from '../lib/format';
import { useProjectedResources } from '../lib/hooks';
import { levelsOf, useCityStore } from '../stores/city';
import { useGameStore } from '../stores/game';
import { toast } from '../stores/ui';
import { useWorldSpeed } from '../stores/world';
import { Countdown, NumberPicker, ResourceCost } from './common';
import { Icon } from './icons';

export const CLASS_ICON = { infantry: 'spear', archer: 'bow', cavalry: 'horseshoe' } as const;

/** Quantas unidades dá para pagar com os recursos atuais. */
function affordable(res: Resources | null, unitCost: Resources): number {
  if (!res) return 0;
  let n = Number.POSITIVE_INFINITY;
  for (const k of RESOURCE_KEYS) if (unitCost[k] > 0) n = Math.min(n, Math.floor(res[k] / unitCost[k]));
  return Number.isFinite(n) ? n : 0;
}

/** Itens de acelerar disponíveis para um timer (Leva 2). */
export function SpeedupButtons({ target }: { target: SpeedupTarget }) {
  const inventory = useGameStore((s) => s.inventory);
  const [busy, setBusy] = useState(false);
  const speedups = inventory.filter((i) => ITEMS[i.itemId]?.effect.kind === 'speedup' && i.quantity > 0);
  if (speedups.length === 0) return null;
  const use = async (itemId: ItemId) => {
    setBusy(true);
    try {
      const city = await api.speedup({ itemId, quantity: 1, target });
      useCityStore.getState().setCity(city);
      useGameStore.getState().setInventory(await api.inventory());
      toast({ kind: 'ok', title: 'Acelerado', body: itemName(itemId) });
    } catch (e) {
      toast({ kind: 'danger', title: 'Não deu para acelerar', body: describeError(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="speedups">
      {speedups.map((i) => (
        <button key={i.itemId} className="btn tiny ghost" disabled={busy} onClick={() => void use(i.itemId)} title={ITEMS[i.itemId].description}>
          <Icon name="hourglass" size={12} /> {itemName(i.itemId).replace('Acelerar ', '')} ×{i.quantity}
        </button>
      ))}
    </div>
  );
}

function JobQueue({ jobs, kind, onDone }: { jobs: TrainingJobDto[]; kind: 'training' | 'healing'; onDone: () => void }) {
  if (jobs.length === 0) return <p className="muted small">Fila vazia.</p>;
  return (
    <ul className="job-queue">
      {jobs.map((j, i) => (
        <li key={j.id}>
          <Icon name={CLASS_ICON[TROOPS[j.troopTypeId].class]} size={14} />
          <span>
            {fmtInt(j.count)} × {troopName(j.troopTypeId)}
          </span>
          <span className="grow" />
          {i === 0 ? <Countdown endsAt={j.endsAt} startsAt={j.startsAt} bar onDone={onDone} /> : <span className="muted small">na fila</span>}
          {i === 0 && <SpeedupButtons target={kind === 'training' ? { kind: 'training', jobId: j.id } : { kind: 'healing', jobId: j.id }} />}
        </li>
      ))}
    </ul>
  );
}

/** Recarrega a cidade quando um timer vence (finalização lazy no GET /city). */
export function refreshCitySoon(delay = 1200): void {
  window.setTimeout(() => {
    api.city().then((c) => useCityStore.getState().setCity(c)).catch(() => undefined);
  }, delay);
}

/** Quartel: treinar tropas e fila. */
export function TrainPanel() {
  const city = useCityStore((s) => s.city);
  const res = useProjectedResources(500);
  const speed = useWorldSpeed();
  const [troop, setTroop] = useState<TroopTypeId>('infantry_t1');
  const [count, setCount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!city) return null;

  const barracks = levelsOf(city).barracks ?? 0;
  const def = TROOPS[troop];
  const unlocked = isTroopUnlocked(troop, barracks);
  const batch = maxBatch(barracks);
  const canPay = affordable(res, def.cost);
  const max = Math.max(0, Math.min(batch, canPay));
  const n = Math.min(count, Math.max(max, 0));
  const cost = trainingCost(troop, Math.max(1, n));
  const time = trainingDurationMs(troop, Math.max(1, n), barracks, speed);
  const queueFull = city.trainingQueue.length >= QUEUES.trainingQueueSize;

  const train = async () => {
    setBusy(true);
    setError(null);
    try {
      useCityStore.getState().setCity(await api.train({ troopTypeId: troop, count: n }));
      toast({ kind: 'ok', title: 'Treino iniciado', body: `${fmtInt(n)} × ${troopName(troop)}` });
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="train-panel">
      <div className="troop-grid">
        {TROOP_IDS.map((id) => {
          const d = TROOPS[id];
          const ok = isTroopUnlocked(id, barracks);
          return (
            <button
              key={id}
              className={`troop-card${id === troop ? ' selected' : ''}${ok ? '' : ' locked'}`}
              onClick={() => setTroop(id)}
              title={ok ? d.name : `Requer Quartel ${TIERS[d.tier].barracksLevel}`}
            >
              <Icon name={CLASS_ICON[d.class]} size={22} />
              <span className="troop-card-name">{d.name}</span>
              <span className="muted small">
                T{d.tier} · em casa {fmtInt(city.troopsHome[id] ?? 0)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="troop-detail">
        <h4>
          {def.name} <span className="muted small">T{def.tier}</span>
        </h4>
        <div className="stat-row">
          <span title="Ataque">
            <Icon name="sword" size={13} /> {def.attack}
          </span>
          <span title="Defesa">
            <Icon name="shield" size={13} /> {def.defense}
          </span>
          <span title="Vida">
            <Icon name="heart" size={13} /> {def.hp}
          </span>
          <span title="Carga">
            <Icon name="chest" size={13} /> {def.load}
          </span>
          <span title="Velocidade (casas/min)">
            <Icon name="flag" size={13} /> {def.speed}
          </span>
          <span title="Manutenção (comida/h)">
            <Icon name="food" size={13} /> {def.upkeepPerHour}/h
          </span>
        </div>
        {!unlocked ? (
          <p className="warn small">Requer Quartel nível {TIERS[def.tier].barracksLevel}.</p>
        ) : (
          <>
            <NumberPicker value={n} max={max} min={0} onChange={setCount} />
            <div className="row gap wrap">
              <ResourceCost cost={cost} have={res} />
              <span className="muted small">
                <Icon name="clock" size={12} /> {fmtDuration(time)}
              </span>
              <span className="muted small">lote máx. {fmtInt(batch)}</span>
            </div>
            {error && <p className="danger small">{error}</p>}
            <button className="btn" disabled={busy || n <= 0 || queueFull} onClick={() => void train()}>
              <Icon name="barracks" size={15} /> {queueFull ? 'Fila cheia' : `Treinar ${fmtInt(n)}`}
            </button>
          </>
        )}
      </div>

      <h4>
        Fila do quartel{' '}
        <span className="muted small">
          {city.trainingQueue.length}/{QUEUES.trainingQueueSize}
        </span>
      </h4>
      <JobQueue jobs={city.trainingQueue} kind="training" onDone={() => refreshCitySoon()} />
    </div>
  );
}

/** Enfermaria: curar feridos (Leva 2). */
export function HealPanel() {
  const city = useCityStore((s) => s.city);
  const res = useProjectedResources(500);
  const speed = useWorldSpeed();
  const [counts, setCounts] = useState<Partial<Record<TroopTypeId, number>>>({});
  const [busy, setBusy] = useState<TroopTypeId | null>(null);
  if (!city) return null;
  const wounded = TROOP_IDS.filter((id) => (city.wounded[id] ?? 0) > 0);
  const queueFull = city.healingQueue.length >= QUEUES.healingQueueSize;

  const heal = async (id: TroopTypeId, n: number) => {
    setBusy(id);
    try {
      useCityStore.getState().setCity(await api.heal({ troopTypeId: id, count: n }));
      setCounts((c) => ({ ...c, [id]: 0 }));
      toast({ kind: 'ok', title: 'Cura iniciada', body: `${fmtInt(n)} × ${troopName(id)}` });
    } catch (e) {
      toast({ kind: 'danger', title: 'Não deu para curar', body: describeError(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="heal-panel">
      <p className="small">
        Leitos: <strong>{fmtInt(city.infirmary.used)}</strong> / {fmtInt(city.infirmary.capacity)}
        <span className="muted"> · feridos acima da capacidade morrem</span>
      </p>
      {wounded.length === 0 && <p className="muted small">Nenhum ferido. Que o Braseiro continue assim.</p>}
      {wounded.map((id) => {
        const have = city.wounded[id] ?? 0;
        const unit = healingCost(id, 1);
        const max = Math.min(have, affordable(res, unit) || 0);
        const n = Math.min(counts[id] ?? have, max);
        return (
          <div key={id} className="heal-row">
            <div className="row gap">
              <Icon name={CLASS_ICON[TROOPS[id].class]} size={16} />
              <strong>{troopName(id)}</strong>
              <span className="muted small">{fmtInt(have)} feridos</span>
            </div>
            <NumberPicker value={n} max={max} onChange={(v) => setCounts((c) => ({ ...c, [id]: v }))} />
            <div className="row gap wrap">
              <ResourceCost cost={healingCost(id, Math.max(1, n))} have={res} compact />
              <span className="muted small">
                <Icon name="clock" size={12} /> {fmtDuration(healingDurationMs(id, Math.max(1, n), speed))}
              </span>
              <button className="btn tiny" disabled={busy != null || n <= 0 || queueFull} onClick={() => void heal(id, n)}>
                <Icon name="infirmary" size={12} /> Curar
              </button>
            </div>
          </div>
        );
      })}
      <h4>
        Fila da enfermaria{' '}
        <span className="muted small">
          {city.healingQueue.length}/{QUEUES.healingQueueSize}
        </span>
      </h4>
      <JobQueue jobs={city.healingQueue} kind="healing" onDone={() => refreshCitySoon()} />
    </div>
  );
}
