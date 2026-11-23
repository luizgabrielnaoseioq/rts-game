import { useMemo, useState } from 'react';
import {
  HEROES,
  HERO_RARITIES,
  TROOPS,
  TROOP_IDS,
  carryCapacity,
  distance,
  gatherDurationMs,
  gatherRatePerMin,
  marchCapacity,
  marchHeroBonuses,
  marchSpeed,
  maxSecondaryHeroes,
  troopCount,
  troopsPower,
  travelMs,
  type HeroDto,
  type HeroRef,
  type Id,
  type TroopCounts,
  type TroopTypeId,
} from '@wn/shared';
import { api } from '../api/endpoints';
import { ApiRequestError, describeError } from '../api/http';
import { MARCH_TYPE_LABEL, heroName, troopName } from '../i18n/labels';
import { fmtCoord, fmtDuration, fmtInt, fmtPct, fmtShort } from '../lib/format';
import { useCityStore } from '../stores/city';
import { useGameStore } from '../stores/game';
import { useMarchStore } from '../stores/marches';
import { toast, useUiStore } from '../stores/ui';
import { useWorldSpeed, useWorldStore } from '../stores/world';
import { Modal, NumberPicker } from './common';
import { Icon } from './icons';

const CLASS_ICON = { infantry: 'spear', archer: 'bow', cavalry: 'horseshoe' } as const;

function HeroChip({ hero, selected, role, onClick, disabled }: { hero: HeroDto; selected: boolean; role?: string; onClick: () => void; disabled?: boolean }) {
  const def = HEROES[hero.heroTypeId];
  return (
    <button
      type="button"
      className={`hero-chip${selected ? ' selected' : ''}`}
      style={{ borderColor: HERO_RARITIES[def.rarity].color }}
      onClick={onClick}
      disabled={disabled}
      title={def.passiveText}
    >
      <Icon name="hero_hall" size={18} color={HERO_RARITIES[def.rarity].color} />
      <span>
        <strong>{def.name}</strong>
        <span className="muted small"> nv {hero.level}</span>
      </span>
      {role && <span className="chip-role">{role}</span>}
    </button>
  );
}

/** Diálogo de marcha: comandante obrigatório + até 2 heróis, tropas, prévia de tempo e carga. */
export function MarchDialog() {
  const draft = useUiStore((s) => s.marchDraft);
  const close = useUiStore((s) => s.closeMarch);
  const city = useCityStore((s) => s.city);
  const heroes = useGameStore((s) => s.heroes);
  const speed = useWorldSpeed();
  const node = useWorldStore((s) =>
    draft ? Object.values(s.nodes).find((n) => n.x === draft.targetX && n.y === draft.targetY) : undefined,
  );

  const [commanderId, setCommanderId] = useState<Id | null>(null);
  const [secondaryIds, setSecondaryIds] = useState<Id[]>([]);
  const [troops, setTroops] = useState<TroopCounts>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const freeHeroes = useMemo(() => heroes.filter((h) => h.activeMarchId == null), [heroes]);
  const keepLevel = city?.level ?? 1;
  const maxSecondary = maxSecondaryHeroes(keepLevel);
  const capacity = city?.marchCapacity ?? marchCapacity(keepLevel);
  const home = city?.troopsHome ?? {};
  const total = troopCount(troops);

  // Comandante padrão: o primeiro herói livre que pode liderar.
  const effectiveCommander = commanderId ?? freeHeroes.find((h) => h.canLead)?.id ?? null;
  const commander = heroes.find((h) => h.id === effectiveCommander) ?? null;
  const secondaries = secondaryIds.map((id) => heroes.find((h) => h.id === id)).filter((h): h is HeroDto => !!h);

  const ref = (h: HeroDto): HeroRef => ({ heroTypeId: h.heroTypeId, level: h.level });
  const { bonuses } = marchHeroBonuses(commander ? ref(commander) : null, secondaries.map(ref));

  if (!draft || !city) return null;

  const target = { x: draft.targetX, y: draft.targetY };
  const dist = distance(city, target);
  const spd = marchSpeed(troops, bonuses.marchSpeed, speed);
  const travel = total > 0 ? travelMs(dist, spd) : null;
  const carry = carryCapacity(troops, bonuses.load);
  const power = troopsPower(troops);
  const gatherMs =
    draft.type === 'GATHER' && node && carry > 0
      ? gatherDurationMs(carry, node.remaining, gatherRatePerMin(node.resourceType, node.level, bonuses.gather, speed))
      : null;
  const slotsFull = city.marchSlots.active >= city.marchSlots.max;

  const setCount = (id: TroopTypeId, v: number) => {
    const others = total - (troops[id] ?? 0);
    const n = Math.max(0, Math.min(v, home[id] ?? 0, capacity - others));
    setTroops((t) => {
      const next = { ...t };
      if (n > 0) next[id] = n;
      else delete next[id];
      return next;
    });
  };

  /** Enche até a capacidade, proporcional ao que há em casa. */
  const fillAll = () => {
    const avail = TROOP_IDS.filter((id) => (home[id] ?? 0) > 0);
    const totalHome = avail.reduce((s, id) => s + (home[id] ?? 0), 0);
    if (totalHome === 0) return;
    const ratio = Math.min(1, capacity / totalHome);
    const next: TroopCounts = {};
    let used = 0;
    for (const id of avail) {
      const n = Math.floor((home[id] ?? 0) * ratio);
      if (n > 0) {
        next[id] = n;
        used += n;
      }
    }
    // Sobra do arredondamento vai para quem ainda tem tropa em casa.
    for (const id of avail) {
      if (used >= capacity) break;
      const extra = Math.min(capacity - used, (home[id] ?? 0) - (next[id] ?? 0));
      if (extra > 0) {
        next[id] = (next[id] ?? 0) + extra;
        used += extra;
      }
    }
    setTroops(next);
  };

  const toggleSecondary = (id: Id) => {
    setSecondaryIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < maxSecondary ? [...cur, id] : cur));
  };

  const validation: string | null = !effectiveCommander
    ? 'Escolha um comandante (todos os heróis estão ocupados?).'
    : total <= 0
      ? 'Escolha pelo menos uma tropa.'
      : total > capacity
        ? 'Tropas acima da capacidade de marcha.'
        : slotsFull
          ? 'Todas as marchas estão ocupadas.'
          : null;

  const submit = async () => {
    if (validation || !effectiveCommander) return;
    setBusy(true);
    setError(null);
    try {
      const m = await api.createMarch({
        type: draft.type,
        targetX: draft.targetX,
        targetY: draft.targetY,
        commanderHeroId: effectiveCommander,
        secondaryHeroIds: secondaryIds.filter((id) => id !== effectiveCommander),
        troops,
      });
      useMarchStore.getState().upsertMine(m);
      toast({ kind: 'ok', title: 'Marcha enviada', body: `${MARCH_TYPE_LABEL[draft.type]} · chega em ${fmtDuration(Date.parse(m.legEndAt) - Date.parse(m.legStartAt))}` });
      // Tropas e heróis mudaram (o socket também avisa, mas evita a tela velha).
      void api.city().then((c) => useCityStore.getState().setCity(c)).catch(() => undefined);
      void api.heroes().then((h) => useGameStore.getState().setHeroes(h)).catch(() => undefined);
      useUiStore.getState().clearSelection();
      close();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const homeTroops = TROOP_IDS.filter((id) => (home[id] ?? 0) > 0);

  return (
    <Modal
      title={
        <>
          <Icon name={draft.type === 'GATHER' ? 'flag' : 'sword'} size={20} /> {MARCH_TYPE_LABEL[draft.type]}: {draft.targetLabel}
        </>
      }
      onClose={close}
      wide
      footer={
        <>
          {error && <span className="danger">{error}</span>}
          {!error && validation && <span className="muted">{validation}</span>}
          <span className="grow" />
          <button className="btn ghost" onClick={close}>
            Cancelar
          </button>
          <button className={`btn ${draft.type === 'GATHER' ? '' : 'danger'}`} disabled={!!validation || busy} onClick={() => void submit()}>
            {busy ? 'Enviando…' : 'Marchar'}
          </button>
        </>
      }
    >
      <div className="march-grid">
        <section>
          <h4>Comandante</h4>
          {freeHeroes.length === 0 && <p className="warn small">Nenhum herói livre.</p>}
          <div className="hero-chips">
            {freeHeroes
              .filter((h) => h.canLead)
              .map((h) => (
                <HeroChip
                  key={h.id}
                  hero={h}
                  selected={h.id === effectiveCommander}
                  role={h.id === effectiveCommander ? 'Comandante' : undefined}
                  onClick={() => {
                    setCommanderId(h.id);
                    setSecondaryIds((cur) => cur.filter((x) => x !== h.id));
                  }}
                />
              ))}
          </div>
          <h4>
            Heróis secundários{' '}
            <span className="muted small">
              ({secondaryIds.length}/{maxSecondary}
              {maxSecondary < 2 ? ' · a Cidadela libera mais' : ''})
            </span>
          </h4>
          <div className="hero-chips">
            {freeHeroes
              .filter((h) => h.id !== effectiveCommander)
              .map((h) => (
                <HeroChip
                  key={h.id}
                  hero={h}
                  selected={secondaryIds.includes(h.id)}
                  role={secondaryIds.includes(h.id) ? '50%' : undefined}
                  disabled={maxSecondary === 0 || (!secondaryIds.includes(h.id) && secondaryIds.length >= maxSecondary)}
                  onClick={() => toggleSecondary(h.id)}
                />
              ))}
            {freeHeroes.filter((h) => h.id !== effectiveCommander).length === 0 && <span className="muted small">—</span>}
          </div>
          {commander && <p className="muted small">{HEROES[commander.heroTypeId].passiveText}</p>}
        </section>

        <section>
          <div className="row">
            <h4 className="grow">
              Tropas{' '}
              <span className={`small ${total > capacity ? 'danger' : 'muted'}`}>
                {fmtInt(total)} / {fmtInt(capacity)}
              </span>
            </h4>
            <button className="btn tiny ghost" onClick={fillAll}>
              Tudo
            </button>
            <button className="btn tiny ghost" onClick={() => setTroops({})}>
              Limpar
            </button>
          </div>
          {homeTroops.length === 0 && <p className="warn small">Sem tropas em casa.</p>}
          <div className="troop-pickers">
            {homeTroops.map((id) => {
              const def = TROOPS[id];
              return (
                <div key={id} className="troop-picker">
                  <div className="troop-picker-name">
                    <Icon name={CLASS_ICON[def.class]} size={16} />
                    <span>
                      {troopName(id)} <span className="muted small">T{def.tier}</span>
                    </span>
                    <span className="muted small">em casa {fmtInt(home[id] ?? 0)}</span>
                  </div>
                  <NumberPicker
                    value={troops[id] ?? 0}
                    max={Math.min(home[id] ?? 0, capacity - (total - (troops[id] ?? 0)))}
                    onChange={(v) => setCount(id, v)}
                  />
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="march-preview">
        <div>
          <span className="muted small">Destino</span>
          <strong>{fmtCoord(target.x, target.y)}</strong>
          <span className="muted small">{dist.toFixed(1)} casas</span>
        </div>
        <div>
          <span className="muted small">Viagem</span>
          <strong>{travel != null && Number.isFinite(travel) ? fmtDuration(travel) : '—'}</strong>
          <span className="muted small">{spd > 0 ? `${spd.toFixed(1)} casas/min` : ''}</span>
        </div>
        <div>
          <span className="muted small">Carga</span>
          <strong>{fmtShort(carry)}</strong>
          <span className="muted small">{bonuses.load > 0 ? fmtPct(bonuses.load) : ''}</span>
        </div>
        {draft.type === 'GATHER' && (
          <div>
            <span className="muted small">Coleta</span>
            <strong>{gatherMs != null && Number.isFinite(gatherMs) ? fmtDuration(gatherMs) : '—'}</strong>
            <span className="muted small">{node ? `${fmtShort(Math.min(carry, node.remaining))} de ${fmtShort(node.remaining)}` : ''}</span>
          </div>
        )}
        {draft.type !== 'GATHER' && (
          <div>
            <span className="muted small">Poder das tropas</span>
            <strong className={draft.recommendedPower && power < draft.recommendedPower ? 'danger' : 'ok'}>{fmtShort(power)}</strong>
            <span className="muted small">{draft.recommendedPower ? `recomendado ${fmtShort(draft.recommendedPower)}` : ''}</span>
          </div>
        )}
        <div>
          <span className="muted small">Marchas</span>
          <strong className={slotsFull ? 'danger' : ''}>
            {city.marchSlots.active}/{city.marchSlots.max}
          </strong>
          <span className="muted small">{commander ? `líder: ${heroName(commander.heroTypeId)}` : ''}</span>
        </div>
      </div>
      <p className="muted small">Prévia com as fórmulas do jogo; o servidor recalcula na hora de marchar.</p>
    </Modal>
  );
}
