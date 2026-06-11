import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { SID3_API_BASE_URL } from '../../core/api/api.config';
import { OperationLog } from './operation-log.models';

@Injectable({ providedIn: 'root' })
export class OperationLogsService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(SID3_API_BASE_URL);

  listLogs(projectId: string, limit = 50): Observable<OperationLog[]> {
    return this.http.get<OperationLog[]>(`${this.apiBaseUrl}/projects/${projectId}/logs`, {
      params: { limit }
    });
  }
}
