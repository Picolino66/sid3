import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { SID3_API_BASE_URL } from '../../core/api/api.config';
import { ApiKey, ApiKeyCreated, CreateApiKeyRequest } from './api-key.models';

@Injectable({ providedIn: 'root' })
export class ApiKeysService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(SID3_API_BASE_URL);

  listApiKeys(projectId: string): Observable<ApiKey[]> {
    return this.http.get<ApiKey[]>(`${this.apiBaseUrl}/projects/${projectId}/api-keys`);
  }

  createApiKey(projectId: string, request: CreateApiKeyRequest): Observable<ApiKeyCreated> {
    return this.http.post<ApiKeyCreated>(`${this.apiBaseUrl}/projects/${projectId}/api-keys`, request);
  }

  revokeApiKey(projectId: string, apiKeyId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiBaseUrl}/projects/${projectId}/api-keys/${apiKeyId}`);
  }
}
