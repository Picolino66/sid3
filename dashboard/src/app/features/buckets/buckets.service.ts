import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { SID3_API_BASE_URL } from '../../core/api/api.config';
import { Bucket, CreateBucketRequest, UpdateBucketRequest } from './bucket.models';

@Injectable({ providedIn: 'root' })
export class BucketsService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(SID3_API_BASE_URL);

  listBuckets(projectId: string): Observable<Bucket[]> {
    return this.http.get<Bucket[]>(`${this.apiBaseUrl}/projects/${projectId}/buckets`);
  }

  createBucket(projectId: string, request: CreateBucketRequest): Observable<Bucket> {
    return this.http.post<Bucket>(`${this.apiBaseUrl}/projects/${projectId}/buckets`, request);
  }

  updateBucket(projectId: string, bucketId: string, request: UpdateBucketRequest): Observable<Bucket> {
    return this.http.patch<Bucket>(`${this.apiBaseUrl}/projects/${projectId}/buckets/${bucketId}`, request);
  }

  deleteBucket(projectId: string, bucketId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiBaseUrl}/projects/${projectId}/buckets/${bucketId}`);
  }
}
