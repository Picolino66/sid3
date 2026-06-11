import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { SID3_API_BASE_URL } from '../../core/api/api.config';
import { Connection, OAuthAuthorizeResponse, OAuthCallbackRequest, UpdateConnectionRequest } from './connection.models';

@Injectable({ providedIn: 'root' })
export class ConnectionsService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(SID3_API_BASE_URL);

  listConnections(): Observable<Connection[]> {
    return this.http.get<Connection[]>(`${this.apiBaseUrl}/connections`);
  }

  createGoogleAuthorizationUrl(): Observable<OAuthAuthorizeResponse> {
    return this.http.post<OAuthAuthorizeResponse>(`${this.apiBaseUrl}/connections/google/authorize`, {});
  }

  completeGoogleConnection(request: OAuthCallbackRequest): Observable<Connection> {
    return this.http.post<Connection>(`${this.apiBaseUrl}/connections/google/callback`, request);
  }

  updateConnection(connectionId: string, request: UpdateConnectionRequest): Observable<Connection> {
    return this.http.patch<Connection>(`${this.apiBaseUrl}/connections/${connectionId}`, request);
  }

  revokeConnection(connectionId: string): Observable<Connection> {
    return this.http.post<Connection>(`${this.apiBaseUrl}/connections/${connectionId}/revoke`, {});
  }
}
