/**
 * Regras de pré-visualização no link público. Só imagem, vídeo e áudio são servidos "inline":
 * HTML, SVG, PDF e afins poderiam executar conteúdo na origem da API.
 */
export type PublicPreviewKind = 'image' | 'video' | 'audio';

export function publicPreviewKind(mimeType: string, isFolder: boolean): PublicPreviewKind | null {
  if (isFolder) {
    return null;
  }
  const type = mimeType.toLowerCase();
  if (type.startsWith('image/') && !type.includes('svg')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  return null;
}

export type ParsedByteRange = { kind: 'full' } | { kind: 'range'; header: string; start: number } | { kind: 'unsatisfiable' };

/**
 * Interpreta um header Range de intervalo único ("bytes=0-", "bytes=100-199", "bytes=-500").
 * Formatos não suportados (vários intervalos, outras unidades) viram resposta completa, como manda o RFC 9110.
 */
export function parseByteRange(header: string | undefined, sizeBytes: number | null): ParsedByteRange {
  const match = header?.trim().match(/^bytes=(\d*)-(\d*)$/);
  if (!match || (match[1] === '' && match[2] === '')) {
    return { kind: 'full' };
  }

  const [, startText = '', endText = ''] = match;
  if (startText !== '' && endText !== '' && Number(endText) < Number(startText)) {
    return { kind: 'full' };
  }

  const start = startText === '' ? Math.max(0, (sizeBytes ?? 0) - Number(endText)) : Number(startText);
  if (sizeBytes !== null && (start >= sizeBytes || (startText === '' && Number(endText) === 0))) {
    return { kind: 'unsatisfiable' };
  }

  return { kind: 'range', header: `bytes=${startText}-${endText}`, start };
}
