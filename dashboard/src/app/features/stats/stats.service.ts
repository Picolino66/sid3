import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { SID3_API_BASE_URL } from '../../core/api/api.config';
import { ConnectionStorageSummary, ProjectStorageStats } from './stats.models';

@Injectable({ providedIn: 'root' })
export class StatsService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(SID3_API_BASE_URL);

  getProjectStorageStats(projectId: string): Observable<ProjectStorageStats> {
    return this.http.get<ProjectStorageStats>(`${this.apiBaseUrl}/projects/${projectId}/stats/storage`);
  }

  getProjectConnectionsStats(projectId: string): Observable<ConnectionStorageSummary[]> {
    return this.http.get<ConnectionStorageSummary[]>(`${this.apiBaseUrl}/projects/${projectId}/stats/connections`);
  }

  getConnectionStats(connectionId: string): Observable<ConnectionStorageSummary> {
    return this.http.get<ConnectionStorageSummary>(`${this.apiBaseUrl}/connections/${connectionId}/stats`);
  }
}
