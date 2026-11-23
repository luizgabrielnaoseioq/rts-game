import { useEffect, useRef, type ReactNode } from 'react';
import { RESOURCE_KEYS, type Resources } from '@wn/shared';
import { fmtClock, fmtShort } from '../lib/format';
import { useServerNow } from '../lib/hooks';
import { resourceName } from '../i18n/labels';
import { Icon, RESOURCE_COLOR } from './icons';

/** Contagem regressiva até `endsAt` (relógio do servidor), com barra opcional. */
export function Countdown({
  endsAt,
  startsAt,
  bar = false,
  onDone,
  doneText = 'concluindo…',
}: {
  endsAt: string;
  startsAt?: string | null;
  bar?: boolean;
  onDone?: () => void;
  doneText?: string;
}) {
  const now = useServerNow(500);
  const end = Date.parse(endsAt);
  const remaining = end - now;
  const fired = useRef(false);
  useEffect(() => {
    if (remaining <= 0 && !fired.current) {
      fired.current = true;
      onDone?.();
    }
    if (remaining > 0) fired.current = false;
  }, [remaining, onDone]);

  const start = startsAt ? Date.parse(startsAt) : NaN;
  const pct = Number.isNaN(start) || end <= start ? null : Math.min(1, Math.max(0, (now - start) / (end - start)));
  return (
    <span className="countdown">
      <Icon name="hourglass" size={13} />
      <span className="countdown-text">{remaining > 0 ? fmtClock(remaining) : doneText}</span>
      {bar && pct != null && (
        <span className="progress small">
          <span style={{ width: `${pct * 100}%` }} />
        </span>
      )}
    </span>
  );
}

export function ProgressBar({ value, max, tone = 'ember' }: { value: number; max: number; tone?: 'ember' | 'gold' | 'ok' | 'blood' | 'frost' }) {
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <span className={`progress tone-${tone}`}>
      <span style={{ width: `${pct * 100}%` }} />
    </span>
  );
}

/** Lista de custo; pinta de vermelho o que falta. */
export function ResourceCost({ cost, have, compact = false }: { cost: Partial<Resources>; have?: Resources | null; compact?: boolean }) {
  return (
    <span className={`res-cost${compact ? ' compact' : ''}`}>
      {RESOURCE_KEYS.filter((k) => (cost[k] ?? 0) > 0).map((k) => {
        const need = cost[k] ?? 0;
        const lacking = have ? have[k] + 1e-9 < need : false;
        return (
          <span key={k} className={`res-cost-item${lacking ? ' lacking' : ''}`} title={resourceName(k)}>
            <Icon name={k} size={compact ? 13 : 15} color={RESOURCE_COLOR[k]} />
            {fmtShort(need)}
          </span>
        );
      })}
    </span>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide = false,
  footer,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal panel ornate${wide ? ' wide' : ''}`} role="dialog" aria-modal="true">
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

/** Seletor numérico com slider e botões. */
export function NumberPicker({
  value,
  max,
  onChange,
  min = 0,
  step = 1,
}: {
  value: number;
  max: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, Math.floor(Number.isFinite(v) ? v : 0)));
  return (
    <span className="num-picker">
      <button type="button" className="icon-btn small" onClick={() => onChange(clamp(value - step))} disabled={value <= min}>
        <Icon name="minus" size={14} />
      </button>
      <input
        type="range"
        min={min}
        max={Math.max(min, max)}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        disabled={max <= min}
      />
      <input
        type="number"
        className="num-input"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
      />
      <button type="button" className="icon-btn small" onClick={() => onChange(clamp(value + step))} disabled={value >= max}>
        <Icon name="plus" size={14} />
      </button>
      <button type="button" className="btn tiny ghost" onClick={() => onChange(clamp(max))} disabled={max <= min}>
        máx
      </button>
    </span>
  );
}

export function EmptyState({ icon, title, children }: { icon: Parameters<typeof Icon>[0]['name']; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={40} />
      <h3>{title}</h3>
      {children && <p className="muted">{children}</p>}
    </div>
  );
}

export function Spinner({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="spinner-wrap">
      <span className="ember-spinner" />
      <span className="muted">{label}</span>
    </div>
  );
}
