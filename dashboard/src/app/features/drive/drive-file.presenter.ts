import { HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { toApiErrorMessage } from '../../core/api/api-error';
import { DriveFile } from './drive.models';

/** Limite para pré-visualizar no navegador sem baixar arquivos enormes para a memória. */
export const DRIVE_PREVIEW_MAX_BYTES = 25 * 1024 * 1024;

const GOOGLE_TYPE_LABELS: Record<string, string> = {
  'application/vnd.google-apps.folder': 'Pasta',
  'application/vnd.google-apps.document': 'Documento Google',
  'application/vnd.google-apps.spreadsheet': 'Planilha Google',
  'application/vnd.google-apps.presentation': 'Apresentação Google',
  'application/vnd.google-apps.drawing': 'Desenho Google',
  'application/vnd.google-apps.form': 'Formulário Google',
  'application/vnd.google-apps.shortcut': 'Atalho',
  'application/pdf': 'PDF'
};

export type DrivePreviewKind = 'image' | 'pdf' | 'text' | 'video' | 'audio';

export function driveTypeLabel(file: DriveFile): string {
  const known = GOOGLE_TYPE_LABELS[file.mimeType];
  if (known) {
    return known;
  }
  const [family = '', subtype] = file.mimeType.split('/');
  const families: Record<string, string> = { image: 'Imagem', video: 'Vídeo', audio: 'Áudio', text: 'Texto' };
  const familyLabel = families[family];
  return familyLabel ? `${familyLabel} (${subtype})` : (subtype ?? file.mimeType);
}

export function drivePreviewKind(file: DriveFile): DrivePreviewKind | null {
  if (file.isFolder || !file.downloadable || file.exportExtension) {
    return null;
  }
  if (file.sizeBytes !== null && file.sizeBytes > DRIVE_PREVIEW_MAX_BYTES) {
    return null;
  }
  const type = file.mimeType.toLowerCase();
  if (type.startsWith('image/')) return 'image';
  if (type === 'application/pdf') return 'pdf';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('text/') || type.includes('json') || type.includes('xml')) return 'text';
  return null;
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/** Nome do arquivo baixado: prefere o Content-Disposition (inclui a extensão de exportação). */
export function downloadFileName(response: HttpResponse<Blob>, file: DriveFile): string {
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      // cai para o nome do índice
    }
  }
  if (file.isFolder) return `${file.name}.zip`;
  return file.exportExtension ? `${file.name}.${file.exportExtension}` : file.name;
}

/** Com responseType 'blob' o corpo de erro chega como Blob; extrai a mensagem JSON da API. */
export async function toBlobApiErrorMessage(error: unknown): Promise<string> {
  if (error instanceof HttpErrorResponse && error.error instanceof Blob) {
    try {
      const body = JSON.parse(await error.error.text()) as { message?: string | string[] };
      if (body.message) {
        return Array.isArray(body.message) ? body.message.join(', ') : body.message;
      }
    } catch {
      // corpo não é JSON
    }
  }
  return toApiErrorMessage(error);
}

export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
