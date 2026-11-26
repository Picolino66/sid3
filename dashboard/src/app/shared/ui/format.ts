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
  return connection.displayName ?? 'GOOGLE_DRIVE';
}

export function connectionStatusLabel(status: 'CONNECTED' | 'REVOKED' | 'ERROR'): string {
  return status === 'CONNECTED' ? 'Conectado' : status === 'REVOKED' ? 'Revogado' : 'Erro';
}

export function formatCount(value: number): string {
  return value.toLocaleString('pt-BR');
}
