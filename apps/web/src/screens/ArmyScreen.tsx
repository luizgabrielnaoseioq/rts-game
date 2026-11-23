import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  HEROES,
  HERO_ABILITIES,
  HERO_IDS,
  HERO_RARITIES,
  ITEMS,
  TROOPS,
  TROOP_CLASSES,
  TROOP_CLASS_DEFS,
  TROOP_IDS,
  isDailyAvailable,
  totalXpForLevel,
  troopUpkeepPerHour,
  troopsPower,
  xpToNext,
  type HeroDto,
  type HeroTypeId,
  type ItemId,
  type SummonResponse,
} from '@wn/shared';
import { api } from '../api/endpoints';
import { describeError } from '../api/http';
import { CLASS_ICON, HealPanel, TrainPanel } from '../components/CityPanels';
import { Countdown, EmptyState, ProgressBar } from '../components/common';
import { Icon } from '../components/icons';
import { heroName, itemName, troopName } from '../i18n/labels';
import { fmtInt, fmtPct, fmtShort } from '../lib/format';
import { useServerNow } from '../lib/hooks';
import { useAuthStore } from '../stores/auth';
import { useCityStore } from '../stores/city';
import { useGameStore } from '../stores/game';
import { toast } from '../stores/ui';

type Tab = 'tropas' | 'herois' | 'taverna' | 'enfermaria';

function TroopsTab() {
  const city = useCityStore((s) => s.city);
  if (!city) return null;
  const home = TROOP_IDS.filter((id) => (city.troopsHome[id] ?? 0) > 0);
  const wounded = TROOP_IDS.filter((id) => (city.wounded[id] ?? 0) > 0);
  return (
    <div className="two-col">
      <section className="panel">
        <h3>Tropas em casa</h3>
        {home.length === 0 ? (
          <p className="muted small">Nenhuma tropa em casa.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Tropa</th>
                <th>Qtd.</th>
                <th>Poder</th>
                <th>Feridos</th>
              </tr>
            </thead>
            <tbody>
              {home.map((id) => (
                <tr key={id}>
                  <td>
                    <Icon name={CLASS_ICON[TROOPS[id].class]} size={14} /> {troopName(id)} <span className="muted small">T{TROOPS[id].tier}</span>
                  </td>
                  <td>{fmtInt(city.troopsHome[id] ?? 0)}</td>
                  <td>{fmtShort((city.troopsHome[id] ?? 0) * TROOPS[id].power)}</td>
                  <td className={(city.wounded[id] ?? 0) > 0 ? 'warn' : 'muted'}>{fmtInt(city.wounded[id] ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted small">
          Poder das tropas: <strong>{fmtShort(troopsPower(city.troopsHome))}</strong> · manutenção{' '}
          {fmtInt(troopUpkeepPerHour(city.troopsHome))} comida/h
          {wounded.length > 0 ? ` · ${fmtInt(wounded.reduce((s, id) => s + (city.wounded[id] ?? 0), 0))} feridos na enfermaria` : ''}
        </p>
        <p className="muted small">Infantaria vence cavalaria, cavalaria vence arqueiros, arqueiros vencem infantaria.</p>
      </section>
      <section className="panel">
        <h3>Quartel</h3>
        <TrainPanel />
      </section>
    </div>
  );
}

/** Progresso de XP no nível atual (aceita xp total ou xp do nível). */
function xpProgress(h: HeroDto): { cur: number; need: number } {
  const need = xpToNext(h.level);
  const base = totalXpForLevel(h.level);
  const cur = h.xp >= base ? h.xp - base : h.xp;
  return { cur: Math.max(0, Math.min(need, cur)), need };
}

function HeroCard({ hero }: { hero: HeroDto }) {
  const def = HEROES[hero.heroTypeId];
  const rarity = HERO_RARITIES[def.rarity];
  const inventory = useGameStore((s) => s.inventory);
  const defenseHeroId = useCityStore((s) => s.city?.defenseHeroId ?? null);
  const [busy, setBusy] = useState(false);
  const tomes = inventory.filter((i) => ITEMS[i.itemId]?.effect.kind === 'hero_xp');
  const maxed = hero.xpForNextLevel == null;
  const { cur, need } = xpProgress(hero);
  const b = hero.bonuses;
  const isDefense = hero.isDefenseCommander || defenseHeroId === hero.id;

  const applyTome = async (itemId: ItemId) => {
    setBusy(true);
    try {
      useGameStore.getState().upsertHero(await api.useItemOnHero(hero.id, { itemId, quantity: 1 }));
      useGameStore.getState().setInventory(await api.inventory());
      toast({ kind: 'ok', title: 'XP concedida', body: `${itemName(itemId)} em ${def.name}` });
    } catch (e) {
      toast({ kind: 'danger', title: 'Não deu para usar', body: describeError(e) });
    } finally {
      setBusy(false);
    }
  };

  const toggleDefense = async () => {
    setBusy(true);
    try {
      useCityStore.getState().setCity(await api.setDefenseHero({ heroId: isDefense ? null : hero.id }));
      useGameStore.getState().setHeroes(await api.heroes());
    } catch (e) {
      toast({ kind: 'danger', title: 'Não deu para mudar a defesa', body: describeError(e) });
    } finally {
      setBusy(false);
    }
  };

  const bonusLines: string[] = [];
  for (const stat of ['attack', 'defense', 'hp'] as const) {
    const label = stat === 'attack' ? 'ATQ' : stat === 'defense' ? 'DEF' : 'VIDA';
    const vals = TROOP_CLASSES.map((c) => b[stat][c]);
    if (vals.every((v) => v === 0)) continue;
    if (vals.every((v) => v === vals[0])) bonusLines.push(`${label} ${fmtPct(vals[0])} (todas)`);
    else
      TROOP_CLASSES.forEach((c) => {
        if (b[stat][c] > 0) bonusLines.push(`${TROOP_CLASS_DEFS[c].plural}: ${label} ${fmtPct(b[stat][c])}`);
      });
  }
  if (b.marchSpeed) bonusLines.push(`Velocidade ${fmtPct(b.marchSpeed)}`);
  if (b.load) bonusLines.push(`Carga ${fmtPct(b.load)}`);
  if (b.gather) bonusLines.push(`Coleta ${fmtPct(b.gather)}`);
  if (b.loot) bonusLines.push(`Saque ${fmtPct(b.loot)}`);

  return (
    <article className="hero-card panel" style={{ borderColor: rarity.color }}>
      <header className="row gap">
        <span className="hero-portrait" style={{ borderColor: rarity.color, color: rarity.color }}>
          <Icon name="hero_hall" size={34} />
        </span>
        <div className="grow">
          <h3>{def.name}</h3>
          <span className="muted small italic">{def.title}</span>
          <div className="small">
            <span style={{ color: rarity.color }}>{rarity.name}</span> · {def.role}
          </div>
        </div>
        <span className="hero-level">
          {hero.level}
          <small>/{hero.maxLevel}</small>
        </span>
      </header>
      <div className="hero-xp">
        {maxed ? <span className="muted small">Nível máximo (o Salão dos Heróis libera mais)</span> : (
          <>
            <ProgressBar value={cur} max={need} tone="gold" />
            <span className="muted small">
              {fmtInt(cur)} / {fmtInt(need)} XP
            </span>
          </>
        )}
      </div>
      <ul className="hero-bonuses small">
        {bonusLines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <p className="small">
        <strong>{HERO_ABILITIES[def.ability].name}:</strong> <span className="muted">{HERO_ABILITIES[def.ability].description}</span>
      </p>
      <div className="row gap wrap">
        <span className={`tag ${hero.activeMarchId ? 'warn' : 'ok'}`}>{hero.activeMarchId ? 'Em marcha' : 'Livre'}</span>
        {isDefense && <span className="tag gold">Comandante de defesa</span>}
        {!hero.canLead && <span className="tag">Só secundário</span>}
      </div>
      <div className="row gap wrap hero-actions">
        {!maxed &&
          tomes.map((t) => (
            <button key={t.itemId} className="btn tiny ghost" disabled={busy} onClick={() => void applyTome(t.itemId)}>
              <Icon name="book" size={12} /> {itemName(t.itemId).replace('Tomo de Experiência ', 'Tomo ')} ×{t.quantity}
            </button>
          ))}
        <button className="btn tiny ghost" disabled={busy} onClick={() => void toggleDefense()}>
          <Icon name="shield" size={12} /> {isDefense ? 'Tirar da defesa' : 'Defender a cidade'}
        </button>
      </div>
    </article>
  );
}

function HeroesTab() {
  const heroes = useGameStore((s) => s.heroes);
  const fragments = useGameStore((s) => s.fragments);
  const [busy, setBusy] = useState<HeroTypeId | null>(null);
  useEffect(() => {
    api.heroes().then((h) => useGameStore.getState().setHeroes(h)).catch(() => undefined);
    api.fragments().then((f) => useGameStore.getState().setFragments(f)).catch(() => undefined);
    api.inventory().then((i) => useGameStore.getState().setInventory(i)).catch(() => undefined);
  }, []);
  const owned = new Set(heroes.map((h) => h.heroTypeId));
  const locked = HERO_IDS.filter((id) => !owned.has(id));

  const unlock = async (heroTypeId: HeroTypeId) => {
    setBusy(heroTypeId);
    try {
      useGameStore.getState().upsertHero(await api.unlockHero({ heroTypeId }));
      useGameStore.getState().setFragments(await api.fragments());
      toast({ kind: 'ok', title: 'Herói liberado!', body: heroName(heroTypeId) });
    } catch (e) {
      toast({ kind: 'danger', title: 'Não deu para liberar', body: describeError(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {heroes.length === 0 && <EmptyState icon="hero_hall" title="Nenhum herói" />}
      <div className="hero-grid">
        {heroes.map((h) => (
          <HeroCard key={h.id} hero={h} />
        ))}
      </div>
      {locked.length > 0 && (
        <>
          <h3 className="section-title">Ainda não liberados</h3>
          <div className="hero-grid">
            {locked.map((id) => {
              const def = HEROES[id];
              const fr = fragments.find((f) => f.heroTypeId === id);
              const required = fr?.required ?? (def.obtain.kind === 'fragments' ? def.obtain.fragments : null);
              const count = fr?.count ?? 0;
              return (
                <article key={id} className="hero-card panel locked" style={{ borderColor: HERO_RARITIES[def.rarity].color }}>
                  <header className="row gap">
                    <span className="hero-portrait" style={{ borderColor: HERO_RARITIES[def.rarity].color }}>
                      <Icon name="hero_hall" size={34} color="#3a332c" />
                    </span>
                    <div className="grow">
                      <h3>{def.name}</h3>
                      <span className="muted small italic">{def.title}</span>
                      <div className="small" style={{ color: HERO_RARITIES[def.rarity].color }}>
                        {HERO_RARITIES[def.rarity].name}
                      </div>
                    </div>
                  </header>
                  <p className="muted small">{def.passiveText}</p>
                  {def.obtain.kind === 'keep_level' && <p className="small">Liberado na Cidadela {def.obtain.keepLevel}.</p>}
                  {required != null && (
                    <>
                      <ProgressBar value={count} max={required} tone="frost" />
                      <span className="muted small">
                        {fmtInt(count)} / {fmtInt(required)} fragmentos
                      </span>
                      <button className="btn tiny" disabled={count < required || busy === id} onClick={() => void unlock(id)}>
                        <Icon name="gem" size={12} /> Liberar
                      </button>
                    </>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

function TavernTab() {
  const tavern = useGameStore((s) => s.tavern);
  const player = useAuthStore((s) => s.player);
  const now = useServerNow(1000);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SummonResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.tavern().then((t) => useGameStore.getState().setTavern(t)).catch((e: unknown) => setError(describeError(e)));
  }, []);

  const freeAt = tavern?.freeSummonAvailableAt ?? player?.freeSummonAvailableAt ?? null;
  const freeReady = freeAt ? Date.parse(freeAt) <= now : isDailyAvailable(null, now);

  const summon = async (free: boolean) => {
    setBusy(true);
    setResult(null);
    try {
      const r = await api.summon({ free });
      setResult(r);
      useGameStore.getState().setTavern(r.tavern);
      api.fragments().then((f) => useGameStore.getState().setFragments(f)).catch(() => undefined);
      api.heroes().then((h) => useGameStore.getState().setHeroes(h)).catch(() => undefined);
      api.city().then((c) => useCityStore.getState().setCity(c)).catch(() => undefined);
    } catch (e) {
      toast({ kind: 'danger', title: 'O chamado falhou', body: describeError(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="two-col">
      <section className="panel tavern">
        <h3>
          <Icon name="hero_hall" size={18} /> Taverna do Salão
        </h3>
        <p className="muted small">Cada chamado traz 5 fragmentos de herói. Todo 10º chamado garante um Épico.</p>
        {error && <p className="warn small">{error}</p>}
        {tavern && (
          <p className="small">
            Chamados feitos: {fmtInt(tavern.summonCount)} · faltam <strong className="gold">{tavern.summonsUntilEpic}</strong> para o Épico
          </p>
        )}
        <div className="row gap wrap">
          <button className="btn" disabled={busy || !freeReady} onClick={() => void summon(true)}>
            <Icon name="star" size={14} /> Chamado grátis
          </button>
          {!freeReady && freeAt && (
            <span className="muted small">
              grátis em <Countdown endsAt={freeAt} />
            </span>
          )}
          <button className="btn ghost" disabled={busy || !tavern} onClick={() => void summon(false)}>
            <Icon name="gold" size={14} color="#E8C25A" /> Chamar ({fmtInt(tavern?.summonCostGold ?? 0)} ouro)
          </button>
        </div>
        {result && (
          <div className="summon-result">
            {result.fragments.map((f, i) => {
              const def = HEROES[f.heroTypeId];
              return (
                <div key={`${f.heroTypeId}-${i}`} className="summon-card" style={{ borderColor: HERO_RARITIES[def.rarity].color, animationDelay: `${i * 120}ms` }}>
                  <Icon name="gem" size={22} color={HERO_RARITIES[def.rarity].color} />
                  <strong>{def.name}</strong>
                  <span className="small">×{f.count}</span>
                  {f.convertedXp > 0 && <span className="muted small">virou {fmtInt(f.convertedXp)} XP</span>}
                </div>
              );
            })}
          </div>
        )}
      </section>
      <section className="panel">
        <h3>Fragmentos</h3>
        <FragmentList />
      </section>
    </div>
  );
}

function FragmentList() {
  const fragments = useGameStore((s) => s.fragments);
  useEffect(() => {
    api.fragments().then((f) => useGameStore.getState().setFragments(f)).catch(() => undefined);
  }, []);
  if (fragments.length === 0) return <p className="muted small">Nenhum fragmento.</p>;
  return (
    <ul className="fragment-list">
      {fragments.map((f) => (
        <li key={f.heroTypeId}>
          <span style={{ color: HERO_RARITIES[HEROES[f.heroTypeId].rarity].color }}>{heroName(f.heroTypeId)}</span>
          <span className="grow" />
          <span className="small">
            {fmtInt(f.count)}
            {f.required != null ? ` / ${fmtInt(f.required)}` : ''}
          </span>
          {f.unlocked && <span className="tag ok">liberado</span>}
        </li>
      ))}
    </ul>
  );
}

export function ArmyScreen() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('aba') as Tab | null) ?? 'tropas';
  const city = useCityStore((s) => s.city);
  const woundedTotal = city ? Object.values(city.wounded).reduce<number>((s, n) => s + (n ?? 0), 0) : 0;
  const tabs: { id: Tab; label: string }[] = [
    { id: 'tropas', label: 'Tropas' },
    { id: 'herois', label: 'Heróis' },
    { id: 'taverna', label: 'Taverna' },
    { id: 'enfermaria', label: woundedTotal > 0 ? `Enfermaria (${fmtInt(woundedTotal)})` : 'Enfermaria' },
  ];
  return (
    <div className="page">
      <header className="page-head">
        <h1 className="title-lg">Exército</h1>
        <div className="tabs">
          {tabs.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setParams({ aba: t.id })}>
              {t.label}
            </button>
          ))}
        </div>
      </header>
      {tab === 'tropas' && <TroopsTab />}
      {tab === 'herois' && <HeroesTab />}
      {tab === 'taverna' && <TavernTab />}
      {tab === 'enfermaria' && (
        <section className="panel narrow">
          <h3>
            <Icon name="infirmary" size={18} /> Enfermaria
          </h3>
          <HealPanel />
        </section>
      )}
    </div>
  );
}
