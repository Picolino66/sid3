/** Formata bytes em unidade legível (pt-BR). */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: unit === 0 ? 0 : 1 })} ${units[unit]}`;
}

export function connectionLabel(connection: { displayName: string | null; providerAccountEmail?: string | null }): string {
  return connection.displayName ?? 'Google Drive';
}

export type ConnectionStatus = 'CONNECTED' | 'REVOKED' | 'ERROR';
export type Tone = 'success' | 'warn' | 'danger' | 'info' | 'neutral' | 'accent';

export function connectionStatusLabel(status: ConnectionStatus): string {
  return status === 'CONNECTED' ? 'Conectado' : status === 'REVOKED' ? 'Revogado' : 'Erro';
}

export function connectionStatusTone(status: ConnectionStatus): Tone {
  return status === 'CONNECTED' ? 'success' : status === 'REVOKED' ? 'neutral' : 'danger';
}

export function formatCount(value: number): string {
  return value.toLocaleString('pt-BR');
}

/** "1 arquivo", "3 arquivos" (com o número formatado em pt-BR). */
export function plural(count: number, singular: string, pluralForm: string): string {
  return `${formatCount(count)} ${count === 1 ? singular : pluralForm}`;
}

/** Iniciais para avatares ("Fotos da família" → "FF"). */
export function initials(value: string | null | undefined): string {
  const words = (value ?? '').trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  const last = words[words.length - 1];
  if (!first || !last) return '?';
  const letters = words.length === 1 ? first.slice(0, 2) : (first[0] ?? '') + (last[0] ?? '');
  return letters.toUpperCase();
}
