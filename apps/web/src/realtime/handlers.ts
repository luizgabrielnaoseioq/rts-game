import type { GameSocket } from './socket';
import { api } from '../api/endpoints';
import { ARRIVAL_LABEL, buildingName, chestName, heroName, troopName } from '../i18n/labels';
import { errorText } from '../i18n/errors';
import { fmtInt } from '../lib/format';
import { useAuthStore } from '../stores/auth';
import { useCityStore } from '../stores/city';
import { useGameStore } from '../stores/game';
import { useMarchStore } from '../stores/marches';
import { toast } from '../stores/ui';
import { useWorldStore } from '../stores/world';

/** Busca o detalhe de uma marcha minha (tropas, carga, fim da coleta) depois de um evento de perna. */
function refreshMyMarch(id: string): void {
  api
    .march(id)
    .then((m) => useMarchStore.getState().upsertMine(m))
    .catch(() => undefined);
}

/** Socket -> stores (ARQUITETURA 6.2). */
export function bindHandlers(s: GameSocket): void {
  // ── mapa ──
  s.on('march:created', ({ march }) => {
    useMarchStore.getState().upsertMap(march);
    if (march.isMine) refreshMyMarch(march.id);
  });

  s.on('march:updated', ({ march }) => {
    useMarchStore.getState().upsertMap(march);
    if (march.isMine) refreshMyMarch(march.id);
  });

  s.on('march:removed', ({ marchId }) => {
    const mine = useMarchStore.getState().mine[marchId];
    useMarchStore.getState().remove(marchId);
    useMarchStore.getState().removeIncoming(marchId);
    if (mine) toast({ kind: 'ok', title: 'Marcha de volta', body: 'Tropas, heróis e saque entraram na cidade.' });
  });

  s.on('map:entity-updated', (u) => useWorldStore.getState().applyEntity(u));

  // ── pessoais ──
  s.on('march:arrived', ({ result }) => {
    const kind = result === 'GATHERING' || result === 'BATTLE' || result === 'STATIONED' ? 'info' : 'warn';
    toast({ kind, title: 'Marcha chegou', body: ARRIVAL_LABEL[result] ?? result });
  });

  s.on('attack:incoming', (p) => {
    useMarchStore.getState().addIncoming(p);
    toast(
      { kind: 'danger', title: 'Ataque a caminho!', body: `${p.attackerName} marcha contra sua cidade.`, href: '/mapa' },
      10_000,
    );
  });

  s.on('attack:cancelled', ({ marchId }) => {
    useMarchStore.getState().removeIncoming(marchId);
    toast({ kind: 'ok', title: 'Ataque cancelado', body: 'O inimigo deu meia-volta.' });
  });

  s.on('report:new', ({ report }) => {
    useGameStore.getState().addReport(report);
    const won =
      report.outcome == null
        ? null
        : (report.role === 'ATTACKER' && report.outcome === 'ATTACKER_WON') ||
          (report.role === 'DEFENDER' && report.outcome === 'DEFENDER_WON');
    const title =
      report.kind === 'GATHER' ? 'Relatório de coleta' : won === true ? 'Vitória!' : won === false ? 'Derrota' : 'Batalha';
    toast({
      kind: won === false ? 'danger' : won === true ? 'ok' : 'info',
      title,
      body: report.opponentName ? `Contra ${report.opponentName}. Toque para ver.` : 'Toque para ver o relatório.',
      href: `/relatorios/${report.id}`,
    });
  });

  s.on('city:resources', (p) => useCityStore.getState().applyResources(p));
  s.on('city:troops', (p) => useCityStore.getState().applyTroops(p));

  s.on('building:completed', ({ building, cityLevel }) => {
    const prevLevel = useCityStore.getState().city?.level ?? 0;
    useCityStore.getState().applyBuildingCompleted(building, cityLevel);
    toast({ kind: 'ok', title: 'Obra concluída', body: `${buildingName(building.typeId)} chegou ao nível ${building.level}.` });
    // Subir a Cidadela muda limites (marchas, filas, era, heróis): recarrega o estado completo.
    if (building.typeId === 'keep' || cityLevel !== prevLevel) {
      api.city().then((c) => useCityStore.getState().setCity(c)).catch(() => undefined);
      api.heroes().then((h) => useGameStore.getState().setHeroes(h)).catch(() => undefined);
    }
  });

  s.on('training:completed', ({ jobId, troopTypeId, count }) => {
    useCityStore.getState().removeTrainingJob(jobId);
    toast({ kind: 'ok', title: 'Treino concluído', body: `${fmtInt(count)} × ${troopName(troopTypeId)} prontos.` });
  });

  s.on('healing:completed', ({ jobId, troopTypeId, count }) => {
    useCityStore.getState().removeHealingJob(jobId);
    toast({ kind: 'ok', title: 'Cura concluída', body: `${fmtInt(count)} × ${troopName(troopTypeId)} de volta à ativa.` });
  });

  s.on('hero:updated', ({ hero }) => {
    const prev = useGameStore.getState().heroes.find((h) => h.id === hero.id);
    useGameStore.getState().upsertHero(hero);
    if (prev && hero.level > prev.level) {
      toast({ kind: 'ok', title: 'Herói subiu de nível', body: `${heroName(hero.heroTypeId)} agora é nível ${hero.level}.` });
    }
  });

  s.on('chest:new', ({ chest }) => {
    useGameStore.getState().addChest(chest);
    toast({ kind: 'info', title: 'Novo baú', body: `${chestName(chest.chestTypeId)} aguarda em Baús.`, href: '/baus' });
  });

  s.on('shield:changed', ({ shieldUntil, shieldKind }) => {
    useAuthStore.getState().setShield(shieldUntil, shieldKind);
    toast({
      kind: shieldUntil ? 'info' : 'warn',
      title: shieldUntil ? 'Escudo ativo' : 'Escudo desfeito',
      body: shieldUntil ? 'Sua cidade não pode ser atacada por enquanto.' : 'Sua cidade pode ser atacada.',
    });
  });

  s.on('server:error', ({ code }) => {
    if (code === 'UNAUTHORIZED') {
      void import('./socket').then((m) => m.reconnectWithFreshToken());
      return;
    }
    toast({ kind: 'danger', title: 'Erro do servidor', body: errorText(code) });
  });
}
