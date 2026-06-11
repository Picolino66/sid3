import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { SID3_API_BASE_URL } from '../../core/api/api.config';
import { AddPoolMemberRequest, CreateStoragePoolRequest, PoolMember, StoragePool } from './storage-pool.models';

@Injectable({ providedIn: 'root' })
export class StoragePoolsService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(SID3_API_BASE_URL);

  listPools(projectId: string): Observable<StoragePool[]> {
    return this.http.get<StoragePool[]>(`${this.apiBaseUrl}/projects/${projectId}/storage-pools`);
  }

  createPool(projectId: string, request: CreateStoragePoolRequest): Observable<StoragePool> {
    return this.http.post<StoragePool>(`${this.apiBaseUrl}/projects/${projectId}/storage-pools`, request);
  }

  getPool(poolId: string): Observable<StoragePool> {
    return this.http.get<StoragePool>(`${this.apiBaseUrl}/storage-pools/${poolId}`);
  }

  deletePool(poolId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiBaseUrl}/storage-pools/${poolId}`);
  }

  addMember(poolId: string, request: AddPoolMemberRequest): Observable<PoolMember> {
    return this.http.post<PoolMember>(`${this.apiBaseUrl}/storage-pools/${poolId}/members`, request);
  }

  removeMember(poolId: string, memberId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiBaseUrl}/storage-pools/${poolId}/members/${memberId}`);
  }
}
