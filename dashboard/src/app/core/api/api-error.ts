import { HttpErrorResponse } from '@angular/common/http';

/**
 * Mensagem de erro pronta para o usuário. Usa a mensagem da API quando ela existe; para falhas de rede e erros
 * internos (que chegam sem mensagem útil) mostra um texto claro em português, sem URL ou detalhe técnico.
 */
export function toApiErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return 'Não foi possível falar com o servidor do SID3. Verifique sua conexão e tente novamente.';
    }

    const message = readApiMessage(error);
    if (message && error.status < 500) {
      return message;
    }

    if (error.status >= 500) {
      return 'O servidor do SID3 encontrou um erro. Tente novamente em instantes.';
    }

    if (error.status === 401) return 'Sua sessão expirou. Entre novamente.';
    if (error.status === 403) return 'Você não tem permissão para esta ação.';
    if (error.status === 404) return 'O item não foi encontrado. Ele pode ter sido removido.';

    return message ?? 'Não foi possível concluir a ação.';
  }

  return 'Algo deu errado. Tente novamente.';
}

/** Detalhe técnico (método, rota e status) para mostrar recolhido em "Detalhes técnicos". */
export function toApiErrorDetails(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }

  let path = error.url ?? '';
  try {
    path = error.url ? new URL(error.url).pathname : '';
  } catch {
    /* URL relativa: usa como veio */
  }

  const status = error.status === 0 ? 'sem resposta' : `${error.status} ${error.statusText}`.trim();
  const apiMessage = readApiMessage(error);
  return [path, status, apiMessage && error.status >= 500 ? apiMessage : null].filter(Boolean).join(' · ');
}

function readApiMessage(error: HttpErrorResponse): string | null {
  const response = error.error as { message?: string | string[] } | null;
  const message = response?.message;

  if (Array.isArray(message)) {
    return message.join(', ');
  }

  return typeof message === 'string' && message.trim() ? message : null;
}
