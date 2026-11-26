import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { SID3_API_BASE_URL } from '../../core/api/api.config';
import {
  CreateProjectRequest,
  Project,
  ProjectConnection,
  ProjectOverview,
  UpdateProjectRequest
} from './project.models';

@Injectable({ providedIn: 'root' })
export class ProjectsService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(SID3_API_BASE_URL);

  listProjects(): Observable<Project[]> {
    return this.http.get<Project[]>(`${this.apiBaseUrl}/projects`);
  }

  createProject(request: CreateProjectRequest): Observable<Project> {
    return this.http.post<Project>(`${this.apiBaseUrl}/projects`, request);
  }

  updateProject(projectId: string, request: UpdateProjectRequest): Observable<Project> {
    return this.http.patch<Project>(`${this.apiBaseUrl}/projects/${projectId}`, request);
  }

  deleteProject(projectId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiBaseUrl}/projects/${projectId}`);
  }

  getOverview(projectId: string): Observable<ProjectOverview> {
    return this.http.get<ProjectOverview>(`${this.apiBaseUrl}/projects/${projectId}/overview`);
  }

  listProjectConnections(projectId: string): Observable<ProjectConnection[]> {
    return this.http.get<ProjectConnection[]>(`${this.apiBaseUrl}/projects/${projectId}/connections`);
  }

  linkConnection(projectId: string, connectionId: string): Observable<ProjectConnection> {
    return this.http.post<ProjectConnection>(`${this.apiBaseUrl}/projects/${projectId}/connections`, { connectionId });
  }

  unlinkConnection(projectId: string, connectionId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiBaseUrl}/projects/${projectId}/connections/${connectionId}`);
  }
}
