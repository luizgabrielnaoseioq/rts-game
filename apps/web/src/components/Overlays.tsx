import { useNavigate } from 'react-router-dom';
import { CONFIG_VERSION } from '@wn/shared';
import { fmtClock, fmtCoord } from '../lib/format';
import { useServerNow } from '../lib/hooks';
import { useMarchStore } from '../stores/marches';
import { useUiStore } from '../stores/ui';
import { useWorldStore } from '../stores/world';
import { Icon } from './icons';

export function Toasts() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);
  const navigate = useNavigate();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast-${t.kind}${t.href ? ' clickable' : ''}`}
          onClick={() => {
            if (t.href) navigate(t.href);
            dismiss(t.id);
          }}
        >
          <strong>{t.title}</strong>
          {t.body && <span>{t.body}</span>}
        </div>
      ))}
    </div>
  );
}

/** Banner vermelho com ataques chegando (attack:incoming). */
export function IncomingAttackBanner() {
  const incoming = useMarchStore((s) => s.incoming);
  const now = useServerNow(500);
  const focusOn = useUiStore((s) => s.focusOn);
  const navigate = useNavigate();
  // Some alguns segundos depois da chegada (o relatório chega por report:new).
  const list = Object.values(incoming).filter((a) => Date.parse(a.arriveAt) > now - 5000);
  if (list.length === 0) return null;
  return (
    <div className="incoming-banner">
      {list.map((a) => {
        const left = Date.parse(a.arriveAt) - now;
        return (
          <div key={a.marchId} className="incoming-row">
            <Icon name="sword" size={18} />
            <span>
              <strong>{a.attackerName}</strong> ataca sua cidade!
            </span>
            <span className="incoming-time">{left > 0 ? fmtClock(left) : 'chegando…'}</span>
            <button
              className="btn tiny ghost"
              onClick={() => {
                navigate('/mapa');
                focusOn(a.fromX, a.fromY);
              }}
            >
              Ver origem ({fmtCoord(a.fromX, a.fromY)})
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function ConfigMismatchBanner() {
  const mismatch = useUiStore((s) => s.configMismatch);
  const serverVersion = useWorldStore((s) => s.info?.configVersion);
  if (!mismatch) return null;
  return (
    <div className="config-banner">
      Versão do jogo desatualizada ({CONFIG_VERSION} ≠ {serverVersion}).{' '}
      <button className="btn tiny" onClick={() => window.location.reload()}>
        Recarregar a página
      </button>
    </div>
  );
}
