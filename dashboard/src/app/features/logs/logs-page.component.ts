import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { ProjectContextService } from '../../core/project-context/project-context.service';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { toApiErrorMessage } from '../../core/api/api-error';
import { OperationLog } from './operation-log.models';
import { OperationLogsService } from './operation-logs.service';

@Component({
  selector: 'sid3-logs-page',
  imports: [DatePipe],
  template: `
    <header class="topbar">
      <div>
        <h1>Logs de operações</h1>
      </div>
      <div class="logs-topbar-controls">
        <div class="logs-limit-control">
          <label for="logs-limit">Limite</label>
          <input id="logs-limit" type="number" min="1" max="100" [value]="limit()" (input)="setLimit($event)" />
        </div>
        <button type="button" [disabled]="!selectedProjectId() || isLoading()" (click)="loadLogs()">
          {{ isLoading() ? 'Carregando...' : 'Atualizar' }}
        </button>
      </div>
    </header>

    @if (errorMessage()) {
      <p class="form-error">{{ errorMessage() }}</p>
    }

    <section class="panel">
      @if (isLoading()) {
        <p class="muted">Carregando logs...</p>
      } @else if (logs().length === 0) {
        <p class="empty-state">Nenhum log para este projeto ainda.</p>
      } @else {
        <div class="table logs-table" role="table" aria-label="Logs de operações">
          <div role="row" class="head">
            <span role="columnheader">Operação</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Bucket</span>
            <span role="columnheader">Objeto</span>
            <span role="columnheader">Requisição</span>
            <span role="columnheader">Criado em</span>
          </div>
          @for (log of logs(); track log.id) {
            <div role="row">
              <span role="cell">{{ operationLabel(log.operation) }}</span>
              <span role="cell">
                <span [class]="'status-label ' + (log.status === 'SUCCESS' ? 'connected' : 'revoked')">
                  {{ log.status === 'SUCCESS' ? 'Sucesso' : 'Falha' }}
                </span>
              </span>
              <span role="cell"><code class="log-id">{{ shortId(log.bucketId) }}</code></span>
              <span role="cell"><code class="log-id">{{ shortId(log.objectId) }}</code></span>
              <span role="cell"><code class="log-id">{{ shortId(log.requestId) }}</code></span>
              <span role="cell">{{ log.createdAt | date: 'dd/MM/yyyy HH:mm' }}</span>
            </div>
          }
        </div>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LogsPageComponent {
  protected readonly projectContext = inject(ProjectContextService);
  private readonly operationLogsService = inject(OperationLogsService);

  protected readonly projects = this.projectContext.projects;
  protected readonly logs = signal<OperationLog[]>([]);
  protected readonly selectedProjectId = computed(() => this.projectContext.currentProjectId() ?? '');
  protected readonly selectedProject = computed(() => this.projects().find((project) => project.id === this.selectedProjectId()));
  protected readonly limit = signal(50);
  protected readonly isLoading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  constructor() {
    toObservable(this.projectContext.currentProjectId)
      .pipe(takeUntilDestroyed())
      .subscribe((projectId) => {
        if (projectId) {
          this.loadLogs();
        } else {
          this.isLoading.set(false);
        }
      });
  }


  setLimit(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.limit.set(Number.isInteger(value) ? Math.min(Math.max(value, 1), 100) : 50);
  }

  loadLogs(): void {
    const projectId = this.selectedProjectId();
    if (!projectId) {
      return;
    }

    this.errorMessage.set(null);
    this.isLoading.set(true);
    this.operationLogsService
      .listLogs(projectId, this.limit())
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (logs) => this.logs.set(logs),
        error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
      });
  }

  protected operationLabel(operation: string): string {
    const labels: Record<string, string> = {
      UPLOAD: 'Upload',
      DOWNLOAD: 'Download',
      LIST: 'Listagem',
      DELETE: 'Exclusão',
      OAUTH_CONNECT: 'Conexão OAuth',
      OAUTH_REVOKE: 'Revogação OAuth',
      API_KEY_CREATE: 'Criação de chave',
      API_KEY_REVOKE: 'Revogação de chave'
    };
    return labels[operation] ?? operation;
  }

  protected shortId(value: string | null): string {
    if (!value) {
      return '-';
    }

    return value.length > 12 ? value.slice(0, 12) : value;
  }

}
