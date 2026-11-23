import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BIOMES,
  biomeAt,
  campPower,
  canAttackByKeepLevel,
  chunkOf,
  distance,
  generateTerrain,
  isShielded,
  marchSpeed,
  terrainTile,
  travelMs,
  type MapCityDto,
  type MapNpcCampDto,
  type MapResourceNodeDto,
  type TileDetailDto,
} from '@wn/shared';
import { api } from '../api/endpoints';
import { describeError } from '../api/http';
import { bannerColor, biomeName, eraName, factionName, obstacleName, resourceName } from '../i18n/labels';
import { fmtCoord, fmtDuration, fmtInt, fmtShort } from '../lib/format';
import { useServerNow } from '../lib/hooks';
import { useAuthStore } from '../stores/auth';
import { useCityStore } from '../stores/city';
import { useUiStore } from '../stores/ui';
import { useWorldSpeed, useWorldStore } from '../stores/world';
import { Countdown, ProgressBar } from './common';
import { Icon, RESOURCE_COLOR } from './icons';

/** Monta um TileDetail a partir do que já está no store (quando o GET do tile falha). */
function localTile(x: number, y: number): TileDetailDto | null {
  const w = useWorldStore.getState();
  if (!w.info) return null;
  const terrain = generateTerrain(w.info.seed, w.info.width, w.info.height);
  const tt = terrainTile(terrain, x, y);
  const at = <T extends { x: number; y: number }>(rec: Record<string, T>) =>
    Object.values(rec).find((e) => e.x === x && e.y === y) ?? null;
  const camp = at(w.camps);
  return {
    x,
    y,
    biome: biomeAt(w.info.seed, x, y, w.info.height),
    obstacle: tt.obstacle,
    chunkId: chunkOf(x, y, w.info.chunkSize),
    city: at(w.cities),
    resourceNode: at(w.nodes),
    npcCamp: camp ? { ...camp, recommendedPower: campPower(camp.level) } : null,
    travelMsFromMyCity: null,
  };
}

/** Popup do tile clicado no mapa (coletar / atacar / info). */
export function TilePopup() {
  const sel = useUiStore((s) => s.selectedTile);
  const clear = useUiStore((s) => s.clearSelection);
  const openMarch = useUiStore((s) => s.openMarch);
  const city = useCityStore((s) => s.city);
  const player = useAuthStore((s) => s.player);
  const speed = useWorldSpeed();
  const now = useServerNow(1000);
  const navigate = useNavigate();
  // Entidades vivas do store (o socket atualiza enquanto o popup está aberto).
  const liveCity = useWorldStore((s) => (sel ? Object.values(s.cities).find((e) => e.x === sel.x && e.y === sel.y) : undefined));
  const liveNode = useWorldStore((s) => (sel ? Object.values(s.nodes).find((e) => e.x === sel.x && e.y === sel.y) : undefined));
  const liveCamp = useWorldStore((s) => (sel ? Object.values(s.camps).find((e) => e.x === sel.x && e.y === sel.y) : undefined));

  const [tile, setTile] = useState<TileDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sel) return;
    let alive = true;
    setTile(localTile(sel.x, sel.y));
    setError(null);
    api
      .tile(sel.x, sel.y)
      .then((t) => alive && setTile(t))
      .catch((e: unknown) => alive && setError(describeError(e)));
    return () => {
      alive = false;
    };
  }, [sel]);

  if (!sel || !tile) return null;

  const cityE: MapCityDto | null = liveCity ?? tile.city;
  const nodeE: MapResourceNodeDto | null = liveNode ?? tile.resourceNode;
  const campE: MapNpcCampDto | null = liveCamp ?? tile.npcCamp;
  const recommended = tile.npcCamp?.recommendedPower ?? (campE ? campPower(campE.level) : null);

  // Prévia de viagem com a velocidade base da infantaria (o diálogo calcula com as tropas escolhidas).
  const travel =
    tile.travelMsFromMyCity ??
    (city ? travelMs(distance(city, { x: sel.x, y: sel.y }), marchSpeed({ infantry_t1: 1 }, 0, speed)) : null);

  const isMine = !!cityE && cityE.ownerId === player?.id;
  const myShield = isShielded(player?.shieldUntil ?? null, now);
  const targetLevelOk = cityE && city ? canAttackByKeepLevel(city.level, cityE.level) : true;
  const biome = BIOMES[tile.biome];

  return (
    <aside className="tile-popup panel ornate">
      <header className="tile-popup-head">
        <div>
          <h3>{cityE ? cityE.name : nodeE ? `${resourceName(nodeE.resourceType)} nv ${nodeE.level}` : campE ? factionName(campE.campTypeId) : biomeName(tile.biome)}</h3>
          <span className="muted small">
            {fmtCoord(sel.x, sel.y)} · <span style={{ color: biome?.colors[1] }}>{biomeName(tile.biome)}</span>
            {tile.obstacle ? ` · ${obstacleName(tile.obstacle)}` : ''}
          </span>
        </div>
        <button className="icon-btn" onClick={clear} aria-label="Fechar">
          <Icon name="close" size={16} />
        </button>
      </header>

      {error && <p className="warn small">Detalhe indisponível: {error}</p>}

      {cityE && (
        <section className="tile-section">
          <div className="row gap">
            <span className="banner-swatch" style={{ background: bannerColor(cityE.bannerColor) }} />
            <div>
              <div>
                Casa de <strong>{cityE.ownerName}</strong>
              </div>
              <div className="muted small">
                Cidadela {cityE.level} · {eraName(cityE.era)} · <Icon name="power" size={11} /> {fmtShort(cityE.power)}
              </div>
            </div>
          </div>
          {cityE.shielded && (
            <p className="gold small">
              <Icon name="shield" size={13} /> Protegida por escudo
            </p>
          )}
          <div className="tile-actions">
            {isMine ? (
              <button className="btn" onClick={() => navigate('/cidade')}>
                <Icon name="keep" size={16} /> Entrar na cidade
              </button>
            ) : (
              <>
                <button
                  className="btn danger"
                  disabled={cityE.shielded || !targetLevelOk || !city}
                  title={
                    cityE.shielded
                      ? 'Alvo com escudo'
                      : !targetLevelOk
                        ? 'Cidadela do alvo 4+ níveis abaixo da sua'
                        : undefined
                  }
                  onClick={() =>
                    openMarch({ type: 'ATTACK_PLAYER', targetX: sel.x, targetY: sel.y, targetLabel: `${cityE.name} (${cityE.ownerName})` })
                  }
                >
                  <Icon name="sword" size={16} /> Atacar cidade
                </button>
                {myShield && !cityE.shielded && targetLevelOk && (
                  <p className="warn small">Atacar desfaz o seu escudo.</p>
                )}
                {!targetLevelOk && <p className="muted small">A Cidadela do alvo é baixa demais para atacar.</p>}
              </>
            )}
          </div>
        </section>
      )}

      {nodeE && (
        <section className="tile-section">
          <div className="row gap">
            <Icon name={nodeE.resourceType} size={28} color={RESOURCE_COLOR[nodeE.resourceType]} />
            <div className="grow">
              <div>
                {fmtInt(nodeE.remaining)} / {fmtInt(nodeE.maxAmount)}
              </div>
              <ProgressBar value={nodeE.remaining} max={nodeE.maxAmount} tone="gold" />
            </div>
          </div>
          {nodeE.status === 'DEPLETED' ? (
            <p className="muted small">
              Esgotado.{' '}
              {nodeE.respawnAt && (
                <>
                  Reaparece em <Countdown endsAt={nodeE.respawnAt} />
                </>
              )}
            </p>
          ) : nodeE.occupiedByPlayerName ? (
            <p className="warn small">Ocupado por {nodeE.occupiedByPlayerName}. Sua marcha volta vazia se ainda estiver ocupado.</p>
          ) : null}
          <div className="tile-actions">
            <button
              className="btn"
              disabled={nodeE.status !== 'AVAILABLE' || !city}
              onClick={() =>
                openMarch({
                  type: 'GATHER',
                  targetX: sel.x,
                  targetY: sel.y,
                  targetLabel: `${resourceName(nodeE.resourceType)} nv ${nodeE.level}`,
                })
              }
            >
              <Icon name="flag" size={16} /> Coletar
            </button>
          </div>
        </section>
      )}

      {campE && (
        <section className="tile-section">
          <div className="row gap">
            <Icon name="skull" size={26} color="#B33" />
            <div className="grow">
              <div>
                {factionName(campE.campTypeId)} · nível {campE.level}
              </div>
              <ProgressBar value={campE.healthRatio} max={1} tone="blood" />
            </div>
          </div>
          {recommended != null && (
            <p className="small">
              Poder recomendado: <strong className="gold">{fmtShort(recommended)}</strong>
              <span className="muted"> · seu poder: {fmtShort(player?.power ?? 0)}</span>
            </p>
          )}
          {campE.status === 'DEFEATED' ? (
            <p className="muted small">
              Derrotado.{' '}
              {campE.respawnAt && (
                <>
                  Volta em <Countdown endsAt={campE.respawnAt} />
                </>
              )}
            </p>
          ) : (
            <div className="tile-actions">
              <button
                className="btn danger"
                disabled={!city}
                onClick={() =>
                  openMarch({
                    type: 'ATTACK_NPC',
                    targetX: sel.x,
                    targetY: sel.y,
                    targetLabel: `${factionName(campE.campTypeId)} nv ${campE.level}`,
                    recommendedPower: recommended,
                  })
                }
              >
                <Icon name="sword" size={16} /> Atacar acampamento
              </button>
            </div>
          )}
        </section>
      )}

      {!cityE && !nodeE && !campE && (
        <p className="muted small">{tile.obstacle ? 'Terreno intransitável para construir, mas marchas passam.' : 'Terreno livre.'}</p>
      )}

      {travel != null && Number.isFinite(travel) && !isMine && (
        <footer className="tile-foot muted small">
          <Icon name="clock" size={13} /> ~{fmtDuration(travel)} de viagem da sua cidade (infantaria)
        </footer>
      )}
    </aside>
  );
}
