import { ERAS, RESOURCE_KEYS, isShielded } from '@wn/shared';
import { useNavigate } from 'react-router-dom';
import { eraName, resourceName } from '../i18n/labels';
import { fmtDuration, fmtInt, fmtShort } from '../lib/format';
import { useProjectedResources, useServerNow } from '../lib/hooks';
import { logout } from '../lib/session';
import { useAuthStore } from '../stores/auth';
import { useCityStore } from '../stores/city';
import { useUiStore } from '../stores/ui';
import { Icon, RESOURCE_COLOR } from './icons';

/** Barra de recursos fixa no topo (ticking local via projectResources). */
export function TopBar() {
  const city = useCityStore((s) => s.city);
  const player = useAuthStore((s) => s.player);
  const connected = useUiStore((s) => s.socketConnected);
  const res = useProjectedResources(250);
  const now = useServerNow(1000);
  const navigate = useNavigate();

  const shielded = isShielded(player?.shieldUntil ?? null, now);
  const shieldLeft = shielded && player?.shieldUntil ? Date.parse(player.shieldUntil) - now : 0;

  return (
    <header className="topbar">
      <div className="topbar-city" onClick={() => navigate('/cidade')} role="button" tabIndex={0}>
        <div className="era-badge" title={city ? eraName(city.era) : ''}>
          <span className="era-roman">{city ? ERAS[city.era].roman : '–'}</span>
          <span className="era-level">{city?.level ?? '–'}</span>
        </div>
        <div className="topbar-city-text">
          <strong>{city?.name ?? '…'}</strong>
          <span className="muted small">
            {city ? eraName(city.era) : ''} · <Icon name="power" size={11} /> {fmtShort(player?.power ?? 0)}
          </span>
        </div>
      </div>

      <div className="topbar-res">
        {RESOURCE_KEYS.map((k) => {
          const v = res?.[k] ?? 0;
          const cap = city?.capacity[k] ?? 0;
          const prod = city?.productionPerHour[k] ?? 0;
          const full = cap > 0 && v >= cap;
          return (
            <div
              key={k}
              className={`res-pill${full ? ' full' : ''}`}
              title={`${resourceName(k)}: ${fmtInt(v)} / ${fmtInt(cap)}\nProdução: ${prod >= 0 ? '+' : ''}${fmtInt(prod)}/h${
                k === 'food' && city ? `\nManutenção das tropas: −${fmtInt(city.upkeepPerHour)}/h` : ''
              }\nProtegido de saque: ${fmtInt(city?.protected[k] ?? 0)}`}
            >
              <Icon name={k} size={20} color={RESOURCE_COLOR[k]} />
              <div className="res-pill-text">
                <span className="res-value">{fmtShort(v)}</span>
                <span className={`res-rate${prod < 0 ? ' neg' : ''}`}>
                  {prod >= 0 ? '+' : ''}
                  {fmtShort(prod)}/h
                </span>
              </div>
              <span className="res-fill" style={{ width: `${cap > 0 ? Math.min(100, (v / cap) * 100) : 0}%` }} />
            </div>
          );
        })}
      </div>

      <div className="topbar-right">
        {shielded && (
          <span className="shield-pill" title={player?.shieldKind === 'TRUCE' ? 'Trégua' : 'Escudo de novato'}>
            <Icon name="shield" size={16} />
            {fmtDuration(shieldLeft)}
          </span>
        )}
        <span className={`conn-dot${connected ? ' on' : ''}`} title={connected ? 'Conectado' : 'Reconectando…'} />
        <span className="muted small">{player?.displayName}</span>
        <button className="icon-btn" onClick={() => void logout()} title="Sair">
          <Icon name="logout" size={18} />
        </button>
      </div>
    </header>
  );
}
