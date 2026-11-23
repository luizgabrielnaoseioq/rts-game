import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  TROOPS,
  sumResources,
  troopCount,
  type BattleReportPayload,
  type BattleSideReport,
  type GatherReportPayload,
  type ReportDetailDto,
  type ReportSummaryDto,
  type TroopTypeId,
} from '@wn/shared';
import { api } from '../api/endpoints';
import { describeError } from '../api/http';
import { EmptyState, ResourceCost, Spinner } from '../components/common';
import { CLASS_ICON } from '../components/CityPanels';
import { Icon } from '../components/icons';
import { REPORT_KIND_LABEL, chestName, heroName, resourceName, troopName } from '../i18n/labels';
import { fmtCoord, fmtDate, fmtDuration, fmtInt, fmtShort } from '../lib/format';
import { useGameStore } from '../stores/game';
import { useUiStore } from '../stores/ui';

function won(r: Pick<ReportSummaryDto, 'role' | 'outcome'>): boolean | null {
  if (!r.outcome) return null;
  if (r.outcome === 'DRAW') return null;
  if (r.role === 'ATTACKER') return r.outcome === 'ATTACKER_WON';
  if (r.role === 'DEFENDER') return r.outcome === 'DEFENDER_WON';
  return null;
}

function ReportListItem({ r }: { r: ReportSummaryDto }) {
  const w = won(r);
  return (
    <li>
      <Link to={`/relatorios/${r.id}`} className={`report-item${r.readAt ? '' : ' unread'}`}>
        <Icon name={r.kind === 'GATHER' ? 'flag' : 'sword'} size={18} />
        <div className="grow">
          <strong>{REPORT_KIND_LABEL[r.kind]}</strong>
          <span className="muted small">
            {r.opponentName ? `${r.opponentName} · ` : ''}
            {fmtCoord(r.x, r.y)}
          </span>
        </div>
        {r.kind !== 'GATHER' && (
          <span className={`tag ${w === true ? 'gold' : w === false ? 'danger' : ''}`}>{w === true ? 'Vitória' : w === false ? 'Derrota' : 'Empate'}</span>
        )}
        <span className="muted small">{fmtDate(r.createdAt)}</span>
      </Link>
    </li>
  );
}

export function ReportsScreen() {
  const { id } = useParams();
  const reports = useGameStore((s) => s.reports);
  const cursor = useGameStore((s) => s.reportsCursor);
  const loaded = useGameStore((s) => s.reportsLoaded);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .reports(null, 20)
      .then((p) => useGameStore.getState().setReports(p.items, p.nextCursor, false))
      // Sem API: mostra o que já tem (ou o vazio) em vez de "Carregando…" para sempre.
      .catch(() => useGameStore.setState({ reportsLoaded: true }));
  }, []);

  const more = async () => {
    if (!cursor) return;
    setBusy(true);
    try {
      const p = await api.reports(cursor, 20);
      useGameStore.getState().setReports(p.items, p.nextCursor, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page reports-page">
      <section className="reports-list panel">
        <h2 className="title-md">Relatórios</h2>
        {!loaded && <Spinner />}
        {loaded && reports.length === 0 && <EmptyState icon="scroll" title="Nenhum relatório">Marche contra um acampamento ou colete num nó.</EmptyState>}
        <ul>
          {reports.map((r) => (
            <ReportListItem key={r.id} r={r} />
          ))}
        </ul>
        {cursor && (
          <button className="btn ghost" disabled={busy} onClick={() => void more()}>
            Carregar mais
          </button>
        )}
      </section>
      <section className="report-detail-wrap">{id ? <ReportDetail id={id} /> : <EmptyState icon="scroll" title="Escolha um relatório" />}</section>
    </div>
  );
}

function SideColumn({ side, title, highlight }: { side: BattleSideReport; title: string; highlight: boolean }) {
  return (
    <div className={`battle-side${highlight ? ' me' : ''}`}>
      <h4>
        {title}: {side.name}
      </h4>
      <p className="muted small">
        Poder {fmtShort(side.powerBefore)} → {fmtShort(side.powerAfter)}
      </p>
      {side.heroes.length > 0 && (
        <ul className="small">
          {side.heroes.map((h) => (
            <li key={h.heroTypeId}>
              <Icon name="hero_hall" size={12} /> {heroName(h.heroTypeId)} nv {h.level}
              {h.xpGained > 0 && <span className="ok"> +{fmtInt(h.xpGained)} XP</span>}
            </li>
          ))}
        </ul>
      )}
      <table className="table compact">
        <thead>
          <tr>
            <th>Tropa</th>
            <th>Antes</th>
            <th>Feridos</th>
            <th>Mortos</th>
            <th>Depois</th>
          </tr>
        </thead>
        <tbody>
          {side.troops.map((t) => (
            <tr key={t.troopTypeId}>
              <td>
                <Icon name={CLASS_ICON[TROOPS[t.troopTypeId]?.class ?? 'infantry']} size={12} /> {troopName(t.troopTypeId)}
              </td>
              <td>{fmtInt(t.before)}</td>
              <td className="warn">{fmtInt(t.wounded)}</td>
              <td className="danger">{fmtInt(t.dead)}</td>
              <td>{fmtInt(t.after)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BattleDetail({ r, p }: { r: ReportDetailDto; p: BattleReportPayload }) {
  const w = won(r);
  const focusOn = useUiStore((s) => s.focusOn);
  const navigate = useNavigate();
  const troopIds = (side: 'attacker' | 'defender') =>
    [...new Set(p.roundLog.flatMap((round) => Object.keys(round[side]) as TroopTypeId[]))];
  return (
    <article className="report-card parchment">
      <div className={`report-outcome ${w === true ? 'win' : w === false ? 'loss' : 'draw'}`}>{w === true ? 'VITÓRIA' : w === false ? 'DERROTA' : 'EMPATE'}</div>
      <p className="center muted small">
        {REPORT_KIND_LABEL[r.kind]} · {fmtCoord(r.x, r.y)} · {fmtDate(r.createdAt)} · {p.rounds} rodada(s)
      </p>
      <div className="battle-cols">
        <SideColumn side={p.attacker} title="Atacante" highlight={r.role === 'ATTACKER'} />
        <SideColumn side={p.defender} title="Defensor" highlight={r.role === 'DEFENDER'} />
      </div>
      {sumResources(p.loot) > 0 && (
        <p>
          <strong>Saque:</strong> <ResourceCost cost={p.loot} />
        </p>
      )}
      {p.chestTypeId && (
        <p>
          <Icon name="chest" size={14} /> {chestName(p.chestTypeId)} (chega com a marcha)
        </p>
      )}
      {p.defenderTruceUntil && <p className="muted small">O defensor ganhou trégua até {fmtDate(p.defenderTruceUntil)}.</p>}
      {p.roundLog.length > 0 && (
        <details className="rounds">
          <summary>Rodada a rodada</summary>
          <table className="table compact">
            <thead>
              <tr>
                <th>Rodada</th>
                <th>Atacante</th>
                <th>Defensor</th>
              </tr>
            </thead>
            <tbody>
              {p.roundLog.map((round) => (
                <tr key={round.round}>
                  <td>{round.round}</td>
                  <td>
                    <strong>{fmtInt(troopCount(round.attacker))}</strong>{' '}
                    <span className="muted small">
                      {troopIds('attacker')
                        .map((id) => `${troopName(id).split(' ')[0]} ${fmtInt(round.attacker[id] ?? 0)}`)
                        .join(' · ')}
                    </span>
                  </td>
                  <td>
                    <strong>{fmtInt(troopCount(round.defender))}</strong>{' '}
                    <span className="muted small">
                      {troopIds('defender')
                        .map((id) => `${troopName(id).split(' ')[0]} ${fmtInt(round.defender[id] ?? 0)}`)
                        .join(' · ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      <button
        className="btn tiny ghost"
        onClick={() => {
          navigate('/mapa');
          focusOn(r.x, r.y);
        }}
      >
        <Icon name="map" size={12} /> Ver no mapa
      </button>
    </article>
  );
}

function GatherDetail({ r, p }: { r: ReportDetailDto; p: GatherReportPayload }) {
  return (
    <article className="report-card parchment">
      <div className="report-outcome win">COLETA</div>
      <p className="center muted small">
        {fmtCoord(r.x, r.y)} · {fmtDate(r.createdAt)}
      </p>
      <p className="center big-number">
        <Icon name={p.resourceType} size={28} /> {fmtInt(p.amount)} {resourceName(p.resourceType).toLowerCase()}
      </p>
      <p className="center small">
        Nó nível {p.nodeLevel} · {fmtDuration(p.durationMs)} coletando{p.recalled ? ' · chamada de volta antes do fim' : ''}
        {p.xpGained > 0 ? ` · +${fmtInt(p.xpGained)} XP para os heróis` : ''}
      </p>
    </article>
  );
}

function ReportDetail({ id }: { id: string }) {
  const [report, setReport] = useState<ReportDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setReport(null);
    setError(null);
    api
      .report(id)
      .then((r) => {
        if (!alive) return;
        setReport(r);
        if (!r.readAt) {
          api.readReport(id).catch(() => undefined);
          useGameStore.getState().markReportRead(id, new Date().toISOString());
        }
      })
      .catch((e: unknown) => alive && setError(describeError(e)));
    return () => {
      alive = false;
    };
  }, [id]);
  if (error) return <p className="danger">{error}</p>;
  if (!report) return <Spinner />;
  return report.kind === 'GATHER' ? (
    <GatherDetail r={report} p={report.payload} />
  ) : (
    <BattleDetail r={report} p={report.payload as BattleReportPayload} />
  );
}
