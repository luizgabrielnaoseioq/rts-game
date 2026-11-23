// Formatação pt-BR de números e tempos.

const intFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const pctFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export function fmtInt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return intFmt.format(Math.floor(n));
}

/** 1.234 / 12,3 mil / 1,2 mi */
export function fmtShort(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${pctFmt.format(n / 1_000_000)} mi`;
  if (abs >= 100_000) return `${intFmt.format(Math.floor(n / 1000))} mil`;
  return intFmt.format(Math.floor(n));
}

/** 0,12 -> "+12%" */
export function fmtPct(frac: number, sign = true): string {
  const v = pctFmt.format(frac * 100);
  return `${sign && frac > 0 ? '+' : ''}${v}%`;
}

/** Duração em ms -> "1h 02m", "3m 05s", "12s". */
export function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms)) return '—';
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

/** Relógio "00:03:12". */
export function fmtClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

const dateFmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d);
}

export function fmtCoord(x: number, y: number): string {
  return `X ${Math.round(x)} · Y ${Math.round(y)}`;
}
