import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { SID3_API_BASE_URL } from '../../core/api/api.config';
import { DriveFileList, DriveIndexRefreshMode, DriveIndexStatus, ListDriveFilesParams } from './drive.models';

@Injectable({ providedIn: 'root' })
export class DriveFilesService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(SID3_API_BASE_URL);

  getIndexStatus(connectionId: string): Observable<DriveIndexStatus> {
    return this.http.get<DriveIndexStatus>(`${this.connectionUrl(connectionId)}/drive-index`);
  }

  refreshIndex(connectionId: string, mode: DriveIndexRefreshMode): Observable<DriveIndexStatus> {
    return this.http.post<DriveIndexStatus>(`${this.connectionUrl(connectionId)}/drive-index/refresh`, { mode });
  }

  listFiles(connectionId: string, params: ListDriveFilesParams): Observable<DriveFileList> {
    let httpParams = new HttpParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        httpParams = httpParams.set(key, String(value));
      }
    }
    return this.http.get<DriveFileList>(`${this.connectionUrl(connectionId)}/drive-files`, { params: httpParams });
  }

  downloadFile(connectionId: string, fileId: string): Observable<HttpResponse<Blob>> {
    return this.http.get(`${this.connectionUrl(connectionId)}/drive-files/${encodeURIComponent(fileId)}/download`, {
      observe: 'response',
      responseType: 'blob'
    });
  }

  /** ZIP da pasta gerado em streaming pela API (o navegador recebe como Blob por causa do JWT). */
  downloadFolderZip(connectionId: string, folderId: string): Observable<HttpResponse<Blob>> {
    return this.http.get(`${this.connectionUrl(connectionId)}/drive-files/${encodeURIComponent(folderId)}/download-zip`, {
      observe: 'response',
      responseType: 'blob'
    });
  }

  private connectionUrl(connectionId: string): string {
    return `${this.apiBaseUrl}/connections/${connectionId}`;
  }
}
