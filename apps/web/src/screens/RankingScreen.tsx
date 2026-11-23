import { useNavigate } from 'react-router-dom';
import { api } from '../api/endpoints';
import { describeError } from '../api/http';
import { Spinner } from '../components/common';
import { Icon } from '../components/icons';
import { fmtCoord, fmtShort } from '../lib/format';
import { useAsync } from '../lib/hooks';
import { useAuthStore } from '../stores/auth';
import { useUiStore } from '../stores/ui';

export function RankingScreen() {
  const { data, error, loading, reload } = useAsync(() => api.players(), []);
  const me = useAuthStore((s) => s.player?.id);
  const focusOn = useUiStore((s) => s.focusOn);
  const navigate = useNavigate();
  const list = data ? [...data].sort((a, b) => b.power - a.power) : [];

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="title-lg">Ranking das Casas</h1>
        <button className="btn tiny ghost" onClick={reload}>
          Atualizar
        </button>
      </header>
      <section className="panel narrow">
        {loading && <Spinner />}
        {error != null && <p className="danger">{describeError(error)}</p>}
        <table className="table ranking">
          <thead>
            <tr>
              <th>#</th>
              <th>Casa</th>
              <th>Cidade</th>
              <th>Cidadela</th>
              <th>Poder</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((p, i) => (
              <tr key={p.id} className={p.id === me ? 'me' : ''}>
                <td className={i < 3 ? 'gold' : 'muted'}>{i < 3 ? <Icon name="crown" size={14} /> : null} {i + 1}</td>
                <td>
                  <strong>{p.displayName}</strong>
                </td>
                <td>{p.cityName}</td>
                <td>{p.cityLevel}</td>
                <td>{fmtShort(p.power)}</td>
                <td>
                  <button
                    className="btn tiny ghost"
                    onClick={() => {
                      navigate('/mapa');
                      focusOn(p.x, p.y);
                    }}
                    title={fmtCoord(p.x, p.y)}
                  >
                    <Icon name="map" size={12} /> Ver no mapa
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
