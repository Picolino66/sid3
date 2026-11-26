import { HttpClient, HttpEvent, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { SID3_API_BASE_URL } from '../../core/api/api.config';
import { ListObjectsParams, ObjectListResponse, StorageObject } from './storage-object.models';

/** Arquivos dos buckets acessados pelo dono logado (JWT) — o painel não precisa de chave de API. */
@Injectable({ providedIn: 'root' })
export class ObjectsService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(SID3_API_BASE_URL);

  listObjects(projectId: string, bucketId: string, params: ListObjectsParams = {}): Observable<ObjectListResponse> {
    let httpParams = new HttpParams().set('limit', String(params.limit ?? 60));
    if (params.prefix) httpParams = httpParams.set('prefix', params.prefix);
    if (params.cursor) httpParams = httpParams.set('cursor', params.cursor);
    if (params.delimiter) httpParams = httpParams.set('delimiter', params.delimiter);

    return this.http.get<ObjectListResponse>(this.objectsUrl(projectId, bucketId), { params: httpParams });
  }

  uploadObjectWithProgress(projectId: string, bucketId: string, key: string, file: File): Observable<HttpEvent<StorageObject>> {
    const body = new FormData();
    body.append('key', key);
    body.append('file', file);

    return this.http.post<StorageObject>(this.objectsUrl(projectId, bucketId), body, {
      reportProgress: true,
      observe: 'events'
    });
  }

  deleteObject(projectId: string, bucketId: string, objectId: string): Observable<void> {
    return this.http.delete<void>(`${this.objectsUrl(projectId, bucketId)}/${objectId}`);
  }

  /** Converte o downloadUrl relativo devolvido pela API em URL absoluta utilizável em <img>/<video>/<a>. */
  absoluteUrl(downloadUrl: string | null | undefined): string | null {
    return downloadUrl ? `${this.apiBaseUrl}${downloadUrl}` : null;
  }

  private objectsUrl(projectId: string, bucketId: string): string {
    return `${this.apiBaseUrl}/projects/${projectId}/buckets/${bucketId}/objects`;
  }
}
