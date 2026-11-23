import { useEffect, useState } from 'react';
import {
  CHESTS,
  HEROES,
  HERO_RARITIES,
  ITEMS,
  RESOURCE_KEYS,
  type ChestDto,
  type ChestRewardDto,
  type ChestTypeId,
  type OpenChestResponse,
} from '@wn/shared';
import { api } from '../api/endpoints';
import { describeError } from '../api/http';
import { Countdown, EmptyState, Modal } from '../components/common';
import { Icon, RESOURCE_COLOR, type IconName } from '../components/icons';
import { CHEST_SOURCE_LABEL, chestName, heroName, itemName, resourceName } from '../i18n/labels';
import { fmtDate, fmtInt } from '../lib/format';
import { useCityStore } from '../stores/city';
import { useGameStore } from '../stores/game';
import { toast } from '../stores/ui';

const CHEST_COLOR: Record<ChestTypeId, string> = {
  chest_iron: '#8A8F98',
  chest_bronze: '#B87333',
  chest_relic: '#C9A24A',
  chest_daily: '#E2572B',
};

function itemIcon(itemId: keyof typeof ITEMS): IconName {
  const k = ITEMS[itemId]?.effect.kind;
  return k === 'speedup' ? 'hourglass' : k === 'hero_xp' ? 'book' : k === 'hero_fragment' ? 'gem' : 'chest';
}

function RewardView({ r, delay }: { r: ChestRewardDto; delay: number }) {
  const style = { animationDelay: `${delay}ms` };
  if (r.kind === 'resources') {
    return (
      <>
        {RESOURCE_KEYS.filter((k) => (r.resources[k] ?? 0) > 0).map((k) => (
          <div key={k} className="reward" style={style}>
            <Icon name={k} size={30} color={RESOURCE_COLOR[k]} />
            <strong>{fmtInt(r.resources[k] ?? 0)}</strong>
            <span className="muted small">{resourceName(k)}</span>
          </div>
        ))}
      </>
    );
  }
  if (r.kind === 'item') {
    return (
      <div className="reward" style={style}>
        <Icon name={itemIcon(r.itemId)} size={30} color="#C9A24A" />
        <strong>×{fmtInt(r.quantity)}</strong>
        <span className="muted small">{itemName(r.itemId)}</span>
      </div>
    );
  }
  const rarity = HERO_RARITIES[HEROES[r.heroTypeId].rarity];
  return (
    <div className="reward" style={{ ...style, borderColor: rarity.color }}>
      <Icon name="gem" size={30} color={rarity.color} />
      <strong>×{fmtInt(r.count)}</strong>
      <span className="muted small">Fragmento: {heroName(r.heroTypeId)}</span>
      {r.convertedXp ? <span className="ok small">virou {fmtInt(r.convertedXp)} XP</span> : null}
    </div>
  );
}

const openRequests = new Map<string, Promise<OpenChestResponse>>();

/** Abertura com animação: tremida, tampa abre, recompensas aparecem uma a uma. */
function OpenChestModal({ chest, onClose }: { chest: ChestDto; onClose: () => void }) {
  const [phase, setPhase] = useState<'shaking' | 'open' | 'error'>('shaking');
  const [rewards, setRewards] = useState<ChestRewardDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const started = Date.now();
    // Reaproveita a mesma chamada se o efeito rodar duas vezes (StrictMode): abrir não é idempotente.
    let req = openRequests.get(chest.id);
    if (!req) {
      req = api.openChest(chest.id);
      openRequests.set(chest.id, req);
    }
    req
      .then((r) => {
        useCityStore.getState().setCity(r.city);
        useGameStore.getState().removeChest(chest.id);
        api.inventory().then((i) => useGameStore.getState().setInventory(i)).catch(() => undefined);
        api.fragments().then((f) => useGameStore.getState().setFragments(f)).catch(() => undefined);
        // Deixa a tremida durar pelo menos ~0,9 s.
        window.setTimeout(() => {
          if (!alive) return;
          setRewards(r.rewards);
          setPhase('open');
        }, Math.max(0, 900 - (Date.now() - started)));
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(describeError(e));
        setPhase('error');
      });
    return () => {
      alive = false;
    };
  }, [chest.id]);

  const color = CHEST_COLOR[chest.chestTypeId] ?? '#C9A24A';
  return (
    <Modal title={chestName(chest.chestTypeId)} onClose={onClose}>
      <div className={`chest-open phase-${phase}`}>
        <div className="chest-art" style={{ color }}>
          <span className="chest-glow" />
          <Icon name="chest" size={110} />
        </div>
        {phase === 'error' && <p className="danger center">{error}</p>}
        {phase === 'open' && (
          <div className="rewards">
            {rewards.map((r, i) => (
              <RewardView key={i} r={r} delay={i * 160} />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

export function ChestsScreen() {
  const chests = useGameStore((s) => s.chests);
  const daily = useGameStore((s) => s.daily);
  const inventory = useGameStore((s) => s.inventory);
  const [opening, setOpening] = useState<ChestDto | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.chests().then((c) => useGameStore.getState().setChests(c)).catch(() => undefined);
    api.daily().then((d) => useGameStore.getState().setDaily(d)).catch(() => undefined);
    api.inventory().then((i) => useGameStore.getState().setInventory(i)).catch(() => undefined);
  }, []);

  const claim = async () => {
    setBusy(true);
    try {
      const chest = await api.claimDaily();
      useGameStore.getState().addChest(chest);
      useGameStore.getState().setDaily(await api.daily());
      setOpening(chest);
    } catch (e) {
      toast({ kind: 'danger', title: 'Oferenda indisponível', body: describeError(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="title-lg">Baús e itens</h1>
      </header>
      <div className="two-col">
        <section className="panel">
          <div className="daily-chest">
            <Icon name="chest" size={48} color={CHEST_COLOR.chest_daily} />
            <div className="grow">
              <h3>{CHESTS.chest_daily.name}</h3>
              <p className="muted small">Uma por dia, grátis. Recursos crescem com a Cidadela.</p>
            </div>
            {daily?.available ? (
              <button className="btn" disabled={busy} onClick={() => void claim()}>
                Receber
              </button>
            ) : daily ? (
              <span className="muted small">
                próxima em <Countdown endsAt={daily.availableAt} onDone={() => api.daily().then((d) => useGameStore.getState().setDaily(d)).catch(() => undefined)} />
              </span>
            ) : null}
          </div>

          <h3 className="section-title">Baús fechados</h3>
          {chests.length === 0 && <EmptyState icon="chest" title="Nenhum baú">Vença acampamentos para ganhar baús.</EmptyState>}
          <div className="chest-grid">
            {chests.map((c) => (
              <button key={c.id} className="chest-card" onClick={() => setOpening(c)} style={{ color: CHEST_COLOR[c.chestTypeId] }}>
                <Icon name="chest" size={46} />
                <strong>{chestName(c.chestTypeId)}</strong>
                <span className="muted small">
                  {CHEST_SOURCE_LABEL[c.source]} · {fmtDate(c.createdAt)}
                </span>
                <span className="btn tiny">Abrir</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <h3>Inventário</h3>
          {inventory.length === 0 && <p className="muted small">Vazio.</p>}
          <ul className="inventory">
            {inventory.map((i) => (
              <li key={i.itemId}>
                <Icon name={itemIcon(i.itemId)} size={22} color="#C9A24A" />
                <div className="grow">
                  <strong>{itemName(i.itemId)}</strong>
                  <span className="muted small">{ITEMS[i.itemId]?.description}</span>
                </div>
                <span className="qty">×{fmtInt(i.quantity)}</span>
              </li>
            ))}
          </ul>
          <p className="muted small">Tomos se usam no herói (Exército → Heróis). Aceleradores, no timer da obra, treino ou cura.</p>
        </section>
      </div>
      {opening && <OpenChestModal key={opening.id} chest={opening} onClose={() => setOpening(null)} />}
    </div>
  );
}
