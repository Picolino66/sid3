import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { SID3_API_BASE_URL } from '../../core/api/api.config';
import { CreateShareLinkRequest, PublicFolderList, PublicSearchResult, PublicShare, ShareLink } from './share-link.models';

@Injectable({ providedIn: 'root' })
export class ShareLinksService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(SID3_API_BASE_URL);

  createShareLink(request: CreateShareLinkRequest): Observable<ShareLink> {
    return this.http.post<ShareLink>(`${this.apiBaseUrl}/share-links`, request);
  }

  listShareLinks(connectionId?: string): Observable<ShareLink[]> {
    return this.http.get<ShareLink[]>(`${this.apiBaseUrl}/share-links`, {
      params: connectionId ? { connectionId } : {}
    });
  }

  revokeShareLink(shareLinkId: string): Observable<ShareLink> {
    return this.http.post<ShareLink>(`${this.apiBaseUrl}/share-links/${shareLinkId}/revoke`, {});
  }

  // ── Acesso público (sem login) ──

  getPublicShare(token: string): Observable<PublicShare> {
    return this.http.get<PublicShare>(this.publicUrl(token));
  }

  listPublicFolder(token: string, folderId: string, page = 1): Observable<PublicFolderList> {
    return this.http.get<PublicFolderList>(`${this.publicUrl(token)}/folders/${encodeURIComponent(folderId)}`, {
      params: { page: String(page) }
    });
  }

  searchPublicShare(token: string, query: string, page = 1): Observable<PublicSearchResult> {
    return this.http.get<PublicSearchResult>(`${this.publicUrl(token)}/search`, {
      params: { q: query, page: String(page) }
    });
  }

  /** Duração do vídeo segundo o Google Drive (usada para avançar vídeos MPEG-TS). */
  getPublicMediaInfo(token: string, fileId: string): Observable<{ durationMs: number | null }> {
    return this.http.get<{ durationMs: number | null }>(`${this.publicUrl(token)}/files/${encodeURIComponent(fileId)}/media-info`);
  }

  /** Endereço para exibir imagem/vídeo/áudio direto no navegador (com avanço do vídeo via Range). */
  publicContentUrl(token: string, fileId: string): string {
    return `${this.publicUrl(token)}/files/${encodeURIComponent(fileId)}/content`;
  }

  /** Link direto: o navegador baixa em streaming, sem carregar o arquivo na memória da página. */
  publicDownloadUrl(token: string, fileId: string): string {
    return `${this.publicUrl(token)}/files/${encodeURIComponent(fileId)}/download`;
  }

  /** ZIP de uma pasta do link (com subpastas), por link direto. */
  publicFolderZipUrl(token: string, folderId: string): string {
    return `${this.publicUrl(token)}/folders/${encodeURIComponent(folderId)}/download-zip`;
  }

  /** ZIP com todos os itens do link. */
  publicShareZipUrl(token: string): string {
    return `${this.publicUrl(token)}/download-zip`;
  }

  private publicUrl(token: string): string {
    return `${this.apiBaseUrl}/public/shares/${encodeURIComponent(token)}`;
  }
}
