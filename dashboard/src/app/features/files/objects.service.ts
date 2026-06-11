import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { SID3_API_BASE_URL } from '../../core/api/api.config';
import { ObjectListResponse, StorageObject } from './storage-object.models';

@Injectable({ providedIn: 'root' })
export class ObjectsService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(SID3_API_BASE_URL);

  listObjects(bucketId: string, apiKeySecret: string, prefix?: string): Observable<ObjectListResponse> {
    return this.http.get<ObjectListResponse>(`${this.apiBaseUrl}/buckets/${bucketId}/objects`, {
      headers: this.apiKeyHeaders(apiKeySecret),
      params: prefix ? { prefix } : {}
    });
  }

  uploadObject(bucketId: string, apiKeySecret: string, key: string, file: File): Observable<StorageObject> {
    const body = new FormData();
    body.append('key', key);
    body.append('file', file);

    return this.http.post<StorageObject>(`${this.apiBaseUrl}/buckets/${bucketId}/objects`, body, {
      headers: this.apiKeyHeaders(apiKeySecret)
    });
  }

  downloadObject(bucketId: string, objectId: string, apiKeySecret: string): Observable<HttpResponse<Blob>> {
    return this.http.get(`${this.apiBaseUrl}/buckets/${bucketId}/objects/${objectId}/download`, {
      headers: this.apiKeyHeaders(apiKeySecret),
      observe: 'response',
      responseType: 'blob'
    });
  }

  deleteObject(bucketId: string, objectId: string, apiKeySecret: string): Observable<void> {
    return this.http.delete<void>(`${this.apiBaseUrl}/buckets/${bucketId}/objects/${objectId}`, {
      headers: this.apiKeyHeaders(apiKeySecret)
    });
  }

  private apiKeyHeaders(apiKeySecret: string): HttpHeaders {
    return new HttpHeaders({
      'X-SID3-API-Key': apiKeySecret
    });
  }
}
