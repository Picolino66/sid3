import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { toApiErrorMessage } from '../../core/api/api-error';
import { Project } from '../projects/project.models';
import { ProjectsService } from '../projects/projects.service';
import { ProjectStorageStats } from './stats.models';
import { StatsService } from './stats.service';

function formatBytes(bytesStr: string): string {
  const bytes = Number(bytesStr);
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function usagePercent(used: string, total: string): number {
  const usedN = Number(used);
  const totalN = Number(total);
  if (totalN === 0) return 0;
  return Math.min(100, Math.round((usedN / totalN) * 100));
}

@Component({
  selector: 'sid3-stats-page',
  imports: [DecimalPipe],
  template: `
    <header class="topbar">
      <div>
        <h1>Estatísticas</h1>
      </div>
      <select class="topbar-select" [value]="selectedProjectId()" (change)="selectProject($event)">
        @for (project of projects(); track project.id) {
          <option [value]="project.id">{{ project.name }}</option>
        }
      </select>
    </header>

    @if (errorMessage()) {
      <p class="form-error">{{ errorMessage() }}</p>
    }

    @if (isLoading()) {
      <p class="muted">Carregando estatísticas...</p>
    } @else if (stats()) {
      <div class="stats-kpi-row">
        <div class="kpi-card">
          <span class="kpi-label">Armazenamento usado</span>
          <strong class="kpi-value">{{ formatBytes(stats()!.totalSizeBytes) }}</strong>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Total de arquivos</span>
          <strong class="kpi-value">{{ stats()!.totalObjectCount | number }}</strong>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Drives conectados</span>
          <strong class="kpi-value">{{ stats()!.byConnection.length }}</strong>
        </div>
      </div>

      <section class="panel">
        <header>
          <h2>Por conexão</h2>
        </header>
        @if (stats()!.byConnection.length === 0) {
          <p class="empty-state">Nenhum uso ainda.</p>
        } @else {
          <div class="conn-stat-list">
            @for (conn of stats()!.byConnection; track conn.connectionId) {
              <div class="conn-stat-row">
                <div class="conn-stat-identity">
                  <strong>{{ conn.displayName ?? 'Google Drive' }}</strong>
                  @if (conn.providerAccountEmail) {
                    <span class="muted">{{ conn.providerAccountEmail }}</span>
                  }
                  <span [class]="'status-label ' + conn.status.toLowerCase()">
                    {{ conn.status === 'CONNECTED' ? 'Conectado' : conn.status === 'REVOKED' ? 'Revogado' : 'Erro' }}
                  </span>
                </div>

                <div class="conn-stat-numbers">
                  <div class="conn-stat-metric">
                    <span class="conn-stat-metric-label">Armazenado via SID3</span>
                    <span class="conn-stat-size">{{ formatBytes(conn.sizeBytes) }}</span>
                    <span class="muted">{{ conn.objectCount | number }} arquivos</span>
                  </div>
                  @if (conn.driveQuotaUsageBytes !== null) {
                    <div class="conn-stat-metric">
                      <span class="conn-stat-metric-label">Uso total do Drive</span>
                      <span class="conn-stat-size">{{ formatBytes(conn.driveQuotaUsageBytes) }}</span>
                      @if (conn.driveQuotaLimitBytes) {
                        <span class="muted">de {{ formatBytes(conn.driveQuotaLimitBytes) }}</span>
                      } @else {
                        <span class="muted">ilimitado</span>
                      }
                    </div>
                  }
                </div>

                @if (conn.driveQuotaUsageBytes !== null && conn.driveQuotaLimitBytes) {
                  <div class="conn-stat-bar-group">
                    <div class="conn-stat-bar-label">
                      <span>Cota do Google Drive</span>
                      <span>{{ usagePercent(conn.driveQuotaUsageBytes, conn.driveQuotaLimitBytes) }}%</span>
                    </div>
                    <div class="conn-stat-bar">
                      <div class="conn-stat-bar-fill" [style.width.%]="usagePercent(conn.driveQuotaUsageBytes, conn.driveQuotaLimitBytes)"></div>
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        }
      </section>

      <section class="panel">
        <header>
          <h2>Por bucket</h2>
        </header>
        @if (stats()!.byBucket.length === 0) {
          <p class="empty-state">Nenhum bucket tem dados ainda.</p>
        } @else {
          <div class="table stats-bucket-table" role="table" aria-label="Armazenamento por bucket">
            <div role="row" class="head">
              <span role="columnheader">Bucket</span>
              <span role="columnheader">Tamanho</span>
              <span role="columnheader">Arquivos</span>
            </div>
            @for (bucket of stats()!.byBucket; track bucket.bucketId) {
              <div role="row">
                <span role="cell">{{ bucket.bucketName }}</span>
                <span role="cell">{{ formatBytes(bucket.sizeBytes) }}</span>
                <span role="cell">{{ bucket.objectCount | number }}</span>
              </div>
            }
          </div>
        }
      </section>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StatsPageComponent {
  private readonly projectsService = inject(ProjectsService);
  private readonly statsService = inject(StatsService);

  protected readonly projects = signal<Project[]>([]);
  protected readonly selectedProjectId = signal('');
  protected readonly stats = signal<ProjectStorageStats | null>(null);
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly formatBytes = formatBytes;
  protected readonly usagePercent = usagePercent;

  constructor() {
    this.projectsService.listProjects().subscribe({
      next: (projects) => {
        this.projects.set(projects);
        const first = projects.at(0);
        if (first) {
          this.selectedProjectId.set(first.id);
          this.loadStats(first.id);
        }
      },
      error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
    });
  }

  selectProject(event: Event): void {
    const projectId = (event.target as HTMLSelectElement).value;
    this.selectedProjectId.set(projectId);
    this.loadStats(projectId);
  }

  private loadStats(projectId: string): void {
    this.isLoading.set(true);
    this.stats.set(null);
    this.statsService
      .getProjectStorageStats(projectId)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (stats) => this.stats.set(stats),
        error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
      });
  }
}
