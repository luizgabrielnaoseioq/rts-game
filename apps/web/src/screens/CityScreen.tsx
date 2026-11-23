import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  BARRACKS,
  BUILDINGS,
  CITY_LAYOUT,
  ERAS,
  KEEP_BASE_PRODUCTION,
  KEEP_LEVELS,
  TIERS,
  WALL,
  barracksTimeFactor,
  buildQueueSize,
  buildingProduction,
  checkUpgrade,
  infirmaryCapacity,
  isBuildingUnlocked,
  maxBatch,
  maxHeroLevel,
  requirementsFor,
  summonCost,
  upgradeCost,
  upgradeDurationMs,
  warehouseCapacity,
  warehouseProtected,
  type BuildingDto,
  type BuildingLevels,
  type BuildingTypeId,
  type CityStateDto,
} from '@wn/shared';
import { api } from '../api/endpoints';
import { describeError } from '../api/http';
import { Countdown, ProgressBar, ResourceCost, Spinner } from '../components/common';
import { HealPanel, SpeedupButtons, TrainPanel, refreshCitySoon } from '../components/CityPanels';
import { Icon, type IconName } from '../components/icons';
import { buildingName, eraName, resourceName } from '../i18n/labels';
import { errorText } from '../i18n/errors';
import { fmtDuration, fmtInt, fmtPct, fmtShort } from '../lib/format';
import { useProjectedResources, useServerNow } from '../lib/hooks';
import { levelsOf, useCityStore } from '../stores/city';
import { toast } from '../stores/ui';
import { useWorldSpeed } from '../stores/world';

const LOT_W = 224;
const LOT_H = 122;

function slotBuilding(city: CityStateDto, slot: number): BuildingDto | undefined {
  return city.buildings.find((b) => b.slot === slot);
}

function isUpgrading(b: BuildingDto | undefined, now: number): boolean {
  return !!b?.upgradeEndsAt && Date.parse(b.upgradeEndsAt) > now - 1500;
}

// ── efeitos por prédio (atual -> próximo nível) ──

function effectLines(typeId: BuildingTypeId, level: number, eco: number): { label: string; now: string; next: string | null }[] {
  const next = level < BUILDINGS[typeId].maxLevel ? level + 1 : null;
  const def = BUILDINGS[typeId];
  if (def.production) {
    const r = def.production.resource;
    return [
      {
        label: `Produção de ${resourceName(r).toLowerCase()}`,
        now: `${fmtInt(buildingProduction(typeId, level) * eco)}/h`,
        next: next ? `${fmtInt(buildingProduction(typeId, next) * eco)}/h` : null,
      },
    ];
  }
  switch (typeId) {
    case 'keep': {
      const row = KEEP_LEVELS[Math.max(1, level) - 1];
      const nrow = next ? KEEP_LEVELS[next - 1] : null;
      return [
        { label: 'Marchas simultâneas', now: String(row.maxMarches), next: nrow ? String(nrow.maxMarches) : null },
        { label: 'Capacidade de marcha', now: fmtInt(row.marchCapacity), next: nrow ? fmtInt(nrow.marchCapacity) : null },
        { label: 'Heróis secundários', now: String(row.secondaryHeroes), next: nrow ? String(nrow.secondaryHeroes) : null },
        { label: 'Filas de obra', now: String(row.buildQueues), next: nrow ? String(nrow.buildQueues) : null },
        {
          label: 'Produção base',
          now: `${fmtInt(KEEP_BASE_PRODUCTION.food * eco)} comida/h…`,
          next: null,
        },
        ...(nrow ? [{ label: 'Libera', now: '', next: nrow.unlocks }] : []),
      ];
    }
    case 'warehouse':
      return [
        { label: 'Capacidade (cada)', now: fmtInt(warehouseCapacity(level)), next: next ? fmtInt(warehouseCapacity(next)) : null },
        { label: 'Protegido de saque', now: fmtInt(warehouseProtected(level)), next: next ? fmtInt(warehouseProtected(next)) : null },
      ];
    case 'infirmary':
      return [{ label: 'Leitos de feridos', now: fmtInt(infirmaryCapacity(level)), next: next ? fmtInt(infirmaryCapacity(next)) : null }];
    case 'barracks':
      return [
        { label: 'Lote máximo', now: fmtInt(maxBatch(level)), next: next ? fmtInt(maxBatch(next)) : null },
        {
          label: 'Tempo de treino',
          now: fmtPct(barracksTimeFactor(level) - 1, false),
          next: next ? fmtPct(barracksTimeFactor(next) - 1, false) : null,
        },
        {
          label: 'Tier liberado',
          now: level >= TIERS[3].barracksLevel ? 'T3' : level >= TIERS[2].barracksLevel ? 'T2' : 'T1',
          next: next ? (next >= TIERS[3].barracksLevel ? 'T3' : next >= TIERS[2].barracksLevel ? 'T2' : 'T1') : null,
        },
      ];
    case 'wall':
      return [
        { label: 'DEF da defesa', now: fmtPct(WALL.defensePerLevel * level), next: next ? fmtPct(WALL.defensePerLevel * next) : null },
        { label: 'VIDA da defesa', now: fmtPct(WALL.hpPerLevel * level), next: next ? fmtPct(WALL.hpPerLevel * next) : null },
      ];
    case 'hero_hall':
      return [
        { label: 'Nível máx. de herói', now: String(maxHeroLevel(level)), next: next ? String(maxHeroLevel(next)) : null },
        { label: 'Chamado na taverna', now: `${fmtInt(summonCost(level))} ouro`, next: next ? `${fmtInt(summonCost(next))} ouro` : null },
      ];
    default:
      return [];
  }
}

// ── lote na grade isométrica ──

function Lot({
  slot,
  col,
  row,
  typeId,
  city,
  levels,
  selected,
  onSelect,
  now,
}: {
  slot: number;
  col: number;
  row: number;
  typeId: BuildingTypeId;
  city: CityStateDto;
  levels: BuildingLevels;
  selected: boolean;
  onSelect: (slot: number) => void;
  now: number;
}) {
  const b = slotBuilding(city, slot);
  const level = b?.level ?? 0;
  const keepLevel = levels.keep ?? 0;
  const unlocked = isBuildingUnlocked(typeId, keepLevel);
  const upgrading = isUpgrading(b, now);
  const left = (col - row) * (LOT_W / 2) + 2 * (LOT_W / 2) + 12;
  const top = (col + row) * (LOT_H / 2) + 64;
  const endMs = b?.upgradeEndsAt ? Date.parse(b.upgradeEndsAt) : 0;
  const startMs = b?.upgradeStartedAt ? Date.parse(b.upgradeStartedAt) : 0;
  const pct = upgrading && endMs > startMs ? Math.min(1, Math.max(0, (now - startMs) / (endMs - startMs))) : 0;

  return (
    <button
      className={`lot${selected ? ' selected' : ''}${unlocked ? '' : ' locked'}${level === 0 ? ' empty' : ''}${typeId === 'keep' ? ' keep' : ''}`}
      style={{ left, top, zIndex: 10 + col + row }}
      onClick={() => onSelect(slot)}
    >
      <svg className="lot-ground" viewBox="0 0 168 92" width={LOT_W} height={LOT_H} preserveAspectRatio="none" aria-hidden>
        <polygon points="84,2 166,46 84,90 2,46" />
        <polygon points="84,10 152,46 84,82 16,46" className="lot-inner" />
      </svg>
      <span className="lot-card">
        <span className="lot-icon">
          <Icon name={typeId as IconName} size={typeId === 'keep' ? 40 : 30} />
        </span>
        <span className="lot-name">{buildingName(typeId)}</span>
        <span className="lot-level">{unlocked ? (level > 0 ? `Nv ${level}` : 'Construir') : `Cidadela ${BUILDINGS[typeId].unlockKeepLevel}`}</span>
        {upgrading && (
          <span className="progress small lot-progress">
            <span style={{ width: `${pct * 100}%` }} />
          </span>
        )}
      </span>
    </button>
  );
}

// ── painel do prédio ──

function BuildingPanel({ slot, city, onClose }: { slot: number; city: CityStateDto; onClose: () => void }) {
  const res = useProjectedResources(500);
  const speed = useWorldSpeed();
  const now = useServerNow(1000);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'info' | 'extra'>('info');
  const layout = CITY_LAYOUT.find((l) => l.slot === slot);
  if (!layout) return null;
  const typeId = layout.typeId;
  const def = BUILDINGS[typeId];
  const b = slotBuilding(city, slot);
  const level = b?.level ?? 0;
  const levels = levelsOf(city);
  const upgrading = isUpgrading(b, now);
  const target = level + 1;
  const maxed = level >= def.maxLevel;
  const activeUpgrades = city.buildings.filter((x) => isUpgrading(x, now)).length;

  const check =
    res && !maxed
      ? checkUpgrade({ typeId, levels, resources: res, activeUpgrades, alreadyUpgrading: upgrading, speed })
      : null;
  const cost = maxed ? null : upgradeCost(typeId, target);
  const duration = maxed ? null : upgradeDurationMs(typeId, target, speed);
  const reqs = maxed ? [] : requirementsFor(typeId, target);

  const upgrade = async () => {
    setBusy(true);
    try {
      const c = await api.upgrade(slot, { typeId });
      useCityStore.getState().setCity(c);
      toast({ kind: 'ok', title: level === 0 ? 'Construção iniciada' : 'Obra iniciada', body: `${def.name} → nível ${target}` });
    } catch (e) {
      toast({ kind: 'danger', title: 'Não deu para subir', body: describeError(e) });
    } finally {
      setBusy(false);
    }
  };

  const extra: ReactNode =
    typeId === 'barracks' ? <TrainPanel /> : typeId === 'infirmary' ? <HealPanel /> : null;

  return (
    <aside className="building-panel panel ornate">
      <header className="bp-head">
        <span className="bp-icon">
          <Icon name={typeId as IconName} size={34} />
        </span>
        <div className="grow">
          <h2>{def.name}</h2>
          <span className="muted small">
            {level > 0 ? `Nível ${level} de ${def.maxLevel}` : 'Não construído'} · {def.description}
          </span>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Fechar">
          <Icon name="close" size={16} />
        </button>
      </header>

      {extra && (
        <div className="tabs">
          <button className={tab === 'info' ? 'active' : ''} onClick={() => setTab('info')}>
            Obra
          </button>
          <button className={tab === 'extra' ? 'active' : ''} onClick={() => setTab('extra')}>
            {typeId === 'barracks' ? 'Treinar' : 'Curar'}
          </button>
        </div>
      )}

      {tab === 'extra' && extra ? (
        extra
      ) : (
        <>
          <table className="effects">
            <tbody>
              {effectLines(typeId, level, speed.economySpeed).map((e) => (
                <tr key={e.label}>
                  <td className="muted">{e.label}</td>
                  <td>{e.now}</td>
                  <td className="ok">{e.next ? `→ ${e.next}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {typeId === 'hero_hall' && (
            <p className="small">
              <Link to="/exercito?aba=taverna">Abrir a taverna e os heróis →</Link>
            </p>
          )}

          {upgrading && b?.upgradeEndsAt ? (
            <section className="bp-upgrading">
              <h4>Em obra → nível {level + 1}</h4>
              <Countdown endsAt={b.upgradeEndsAt} startsAt={b.upgradeStartedAt} bar onDone={() => refreshCitySoon()} />
              <SpeedupButtons target={{ kind: 'building', slot }} />
            </section>
          ) : maxed ? (
            <p className="gold">Nível máximo.</p>
          ) : (
            <section className="bp-upgrade">
              <h4>{level === 0 ? 'Construir' : `Subir para o nível ${target}`}</h4>
              {cost && <ResourceCost cost={cost} have={res} />}
              <p className="muted small">
                <Icon name="clock" size={12} /> {duration != null ? fmtDuration(duration) : '—'}
              </p>
              {reqs.length > 0 && (
                <ul className="reqs">
                  {reqs.map((r) => {
                    const ok = (levels[r.typeId] ?? 0) >= r.level;
                    return (
                      <li key={`${r.typeId}-${r.level}`} className={ok ? 'ok' : 'danger'}>
                        {ok ? '✔' : '✖'} {buildingName(r.typeId)} nível {r.level}
                      </li>
                    );
                  })}
                </ul>
              )}
              {check && !check.ok && <p className="warn small">{errorText(check.code)}</p>}
              <button className="btn big" disabled={busy || !check || !check.ok} onClick={() => void upgrade()}>
                <Icon name="hammer" size={16} /> {level === 0 ? 'Construir' : 'Subir nível'}
              </button>
            </section>
          )}
        </>
      )}
    </aside>
  );
}

function BuildQueue({ city }: { city: CityStateDto }) {
  const now = useServerNow(1000);
  const active = city.buildings.filter((b) => isUpgrading(b, now));
  const max = city.buildQueue.max || buildQueueSize(city.level);
  return (
    <section className="build-queue panel">
      <h4>
        <Icon name="hammer" size={15} /> Obras{' '}
        <span className="muted small">
          {active.length}/{max}
        </span>
      </h4>
      {active.length === 0 && <p className="muted small">Nenhuma obra. Clique num prédio para subir de nível.</p>}
      {active.map((b) => (
        <div key={b.id} className="bq-row">
          <span>
            {buildingName(b.typeId)} → {b.level + 1}
          </span>
          {b.upgradeEndsAt && <Countdown endsAt={b.upgradeEndsAt} startsAt={b.upgradeStartedAt} bar onDone={() => refreshCitySoon()} />}
        </div>
      ))}
      {city.trainingQueue.length > 0 && (
        <div className="bq-row">
          <span>Quartel: {fmtInt(city.trainingQueue.reduce((s, j) => s + j.count, 0))} tropas</span>
          <Countdown endsAt={city.trainingQueue[city.trainingQueue.length - 1].endsAt} />
        </div>
      )}
    </section>
  );
}

export function CityScreen() {
  const city = useCityStore((s) => s.city);
  const loading = useCityStore((s) => s.loading);
  const now = useServerNow(1000);
  const [selected, setSelected] = useState<number | null>(0);
  const [renaming, setRenaming] = useState<string | null>(null);

  if (!city) return loading ? <Spinner label="Acendendo o Braseiro…" /> : <Spinner label="Carregando cidade…" />;
  const levels = levelsOf(city);
  const era = ERAS[city.era];
  const keepRow = KEEP_LEVELS[Math.max(1, city.level) - 1];

  const rename = async () => {
    if (!renaming) return;
    try {
      useCityStore.getState().setCity(await api.renameCity(renaming.trim()));
      setRenaming(null);
    } catch (e) {
      toast({ kind: 'danger', title: 'Não deu para renomear', body: describeError(e) });
    }
  };

  return (
    <div className={`city-screen era-${city.era}`}>
      <div className="city-main">
        <header className="city-head">
          {renaming != null ? (
            <form
              className="row gap"
              onSubmit={(e) => {
                e.preventDefault();
                void rename();
              }}
            >
              <input value={renaming} onChange={(e) => setRenaming(e.target.value)} maxLength={24} autoFocus />
              <button className="btn tiny">Salvar</button>
              <button type="button" className="btn tiny ghost" onClick={() => setRenaming(null)}>
                Cancelar
              </button>
            </form>
          ) : (
            <h1 className="title-lg" onDoubleClick={() => setRenaming(city.name)} title="Duplo clique para renomear">
              {city.name}
            </h1>
          )}
          <div className="city-sub">
            <span className="era-chip">
              Era {era.roman} · {eraName(city.era)}
            </span>
            <span className="muted small">
              Cidadela {city.level} · X {city.x} · Y {city.y}
            </span>
          </div>
          <div className="city-stats">
            <span title="Marchas">
              <Icon name="flag" size={14} /> {city.marchSlots.active}/{city.marchSlots.max} marchas
            </span>
            <span title="Capacidade de marcha">
              <Icon name="barracks" size={14} /> {fmtInt(city.marchCapacity || keepRow.marchCapacity)} por marcha
            </span>
            <span title="Leitos da enfermaria">
              <Icon name="infirmary" size={14} /> {fmtInt(city.infirmary.used)}/{fmtInt(city.infirmary.capacity)} feridos
            </span>
            <span title="Manutenção">
              <Icon name="food" size={14} /> −{fmtShort(city.upkeepPerHour)}/h
            </span>
          </div>
        </header>

        <div className="city-grid-wrap">
          <div className="city-grid">
            <div className="brazier" aria-hidden />
            {CITY_LAYOUT.map((l) => (
              <Lot
                key={l.slot}
                slot={l.slot}
                col={l.col}
                row={l.row}
                typeId={l.typeId}
                city={city}
                levels={levels}
                selected={selected === l.slot}
                onSelect={setSelected}
                now={now}
              />
            ))}
          </div>
        </div>
        <p className="muted small center">{era.description}</p>
      </div>

      <div className="city-side">
        {selected != null && <BuildingPanel key={selected} slot={selected} city={city} onClose={() => setSelected(null)} />}
        <BuildQueue city={city} />
        <section className="panel era-panel">
          <h4>Próximo marco</h4>
          {city.level < KEEP_LEVELS.length ? (
            <p className="small">
              Cidadela {city.level + 1}: {KEEP_LEVELS[city.level].unlocks}
            </p>
          ) : (
            <p className="small gold">Guardião da Chama.</p>
          )}
          <ProgressBar value={city.level} max={KEEP_LEVELS.length} tone="gold" />
          <p className="muted small">Quartel lote máx. {fmtInt(maxBatch(levels.barracks ?? 0))} · bônus de muralha {fmtPct(WALL.defensePerLevel * (levels.wall ?? 0))}</p>
          <p className="muted small">Lote por nível do quartel: {BARRACKS.batchPerLevel}</p>
        </section>
      </div>
    </div>
  );
}
