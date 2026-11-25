/** Escopos OAuth que permitem ler todo o conteúdo do Drive (não apenas arquivos criados pelo SID3). */
export const DRIVE_FULL_READ_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive'
];

export function hasDriveFullReadScope(scopes: string[]): boolean {
  return scopes.some((scope) => DRIVE_FULL_READ_SCOPES.includes(scope));
}
