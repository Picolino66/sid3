/** Content-Disposition seguro para nomes com acentos/aspas (RFC 6266 + RFC 5987). */
export function buildAttachmentDisposition(fileName: string): string {
  return buildDisposition('attachment', fileName);
}

/** Igual ao de anexo, mas pede ao navegador para exibir o conteúdo (imagem, vídeo, áudio). */
export function buildInlineDisposition(fileName: string): string {
  return buildDisposition('inline', fileName);
}

function buildDisposition(type: 'attachment' | 'inline', fileName: string): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `${type}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
