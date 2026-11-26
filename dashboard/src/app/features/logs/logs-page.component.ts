import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { toApiErrorDetails, toApiErrorMessage } from '../../core/api/api-error';
import { NotificationService } from '../../core/notifications/notification.service';
import { ProjectContextService } from '../../core/project-context/project-context.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { ErrorStateComponent } from '../../shared/ui/error-state.component';
import { plural } from '../../shared/ui/format';
import { IconComponent } from '../../shared/ui/icon.component';
import { NoProjectStateComponent } from '../../shared/ui/no-project-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { SkeletonComponent } from '../../shared/ui/skeleton.component';
import { matchesQuery, TableSort } from '../../shared/ui/table-sort';
import { OperationLog, OperationType } from './operation-log.models';
import { OperationLogsService } from './operation-logs.service';

type LogSortKey = 'operation' | 'createdAt';

const OPERATION_LABELS: Record<OperationType, string> = {
  UPLOAD: 'Envio',
  DOWNLOAD: 'Download',
  LIST: 'Listagem',
  DELETE: 'Exclusão',
  OAUTH_CONNECT: 'Conexão OAuth',
  OAUTH_REVOKE: 'Revogação OAuth',
  API_KEY_CREATE: 'Criação de chave',
  API_KEY_REVOKE: 'Revogação de chave'
};

@Component({
  selector: 'sid3-logs-page',
  imports: [DatePipe, NgTemplateOutlet, EmptyStateComponent, ErrorStateComponent, IconComponent, NoProjectStateComponent, PageHeaderComponent, SkeletonComponent],
  template: `
    <sid3-page-header title="Logs de operações" description="Cada envio, download, exclusão e mudança de acesso deste projeto.">
      @if (selectedProjectId()) {
        <label class="cluster" style="gap: var(--space-2)">
          <span class="muted text-sm">Mostrar</span>
          <select class="select select--sm" style="width: auto" [value]="limit()" (change)="setLimit($event)" aria-label="Quantidade de registros">
            @for (option of limitOptions; track option) {
              <option [value]="option" [selected]="option === limit()">{{ option }} últimos</option>
            }
          </select>
        </label>
        <button class="btn" type="button" [disabled]="isLoading()" (click)="loadLogs()">
          <sid3-icon name="refresh" [spin]="isLoading()" />{{ isLoading() ? 'Atualizando...' : 'Atualizar' }}
        </button>
      }
    </sid3-page-header>

    @if (projectContext.loaded() && !selectedProjectId()) {
      <sid3-no-project-state />
    } @else {
      <section class="card">
        @if (isLoading() && logs().length === 0) {
          <sid3-skeleton [count]="6" label="Carregando logs" />
        } @else if (loadError(); as failure) {
          <sid3-error-state title="Não foi possível carregar os logs" [message]="failure.message" [details]="failure.details" [busy]="isLoading()" (retry)="loadLogs()" />
        } @else if (logs().length === 0) {
          <sid3-empty-state icon="list" title="Nenhuma operação registrada" description="Envios, downloads e mudanças de acesso deste projeto aparecem aqui assim que acontecerem." />
        } @else {
          <div class="toolbar">
            <div class="toolbar__group">
              <label class="input-icon toolbar__search">
                <span class="sr-only">Buscar nos logs</span>
                <sid3-icon name="search" />
                <input class="input input--sm" type="search" placeholder="Buscar por ID, código de erro..." [value]="query()" (input)="query.set($any($event.target).value)" />
              </label>
              <div class="segmented" role="group" aria-label="Filtrar por resultado">
                <button type="button" [attr.aria-pressed]="statusFilter() === 'all'" (click)="statusFilter.set('all')">Todos</button>
                <button type="button" [attr.aria-pressed]="statusFilter() === 'FAILED'" (click)="statusFilter.set('FAILED')">Falhas ({{ failedCount() }})</button>
                <button type="button" [attr.aria-pressed]="statusFilter() === 'SUCCESS'" (click)="statusFilter.set('SUCCESS')">Sucesso</button>
              </div>
              <select class="select select--sm" style="width: auto" aria-label="Filtrar por operação" [value]="operationFilter()" (change)="operationFilter.set($any($event.target).value)">
                <option value="" [selected]="!operationFilter()">Todas as operações</option>
                @for (operation of operations(); track operation) {
                  <option [value]="operation" [selected]="operation === operationFilter()">{{ operationLabel(operation) }}</option>
                }
              </select>
            </div>
          </div>
          <div class="table-wrap" [style.opacity]="isLoading() ? 0.6 : 1">
            <table class="table table--responsive">
              <thead>
                <tr>
                  <th [attr.aria-sort]="sort.aria('operation')">
                    <button class="sort-btn" type="button" (click)="sort.toggle('operation')">Operação <sid3-icon [name]="sort.icon('operation')" size="sm" /></button>
                  </th>
                  <th>Resultado</th>
                  <th>Bucket</th>
                  <th>Objeto</th>
                  <th>Requisição</th>
                  <th [attr.aria-sort]="sort.aria('createdAt')">
                    <button class="sort-btn" type="button" (click)="sort.toggle('createdAt')">Quando <sid3-icon [name]="sort.icon('createdAt')" size="sm" /></button>
                  </th>
                </tr>
              </thead>
              <tbody>
                @for (log of visibleLogs(); track log.id) {
                  <tr>
                    <td class="cell-primary"><strong style="font-weight: var(--weight-medium)">{{ operationLabel(log.operation) }}</strong></td>
                    <td data-label="Resultado">
                      <div class="cluster" style="gap: 6px">
                        <span [class]="log.status === 'SUCCESS' ? 'chip chip--success' : 'chip chip--danger'">{{ log.status === 'SUCCESS' ? 'Sucesso' : 'Falha' }}</span>
                        @if (log.errorCode) {
                          <code class="code-inline text-xs">{{ log.errorCode }}</code>
                        }
                      </div>
                    </td>
                    <td data-label="Bucket"><ng-container *ngTemplateOutlet="idCell; context: { $implicit: log.bucketId }" /></td>
                    <td data-label="Objeto"><ng-container *ngTemplateOutlet="idCell; context: { $implicit: log.objectId }" /></td>
                    <td data-label="Requisição"><ng-container *ngTemplateOutlet="idCell; context: { $implicit: log.requestId }" /></td>
                    <td class="col-date" data-label="Quando">{{ log.createdAt | date: 'dd/MM/yyyy HH:mm:ss' }}</td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="6">
                      <sid3-empty-state icon="search" title="Nenhum registro com esses filtros" [compact]="true">
                        <button class="btn btn--sm" type="button" (click)="clearFilters()">Limpar filtros</button>
                      </sid3-empty-state>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="table-footer">
            <span>{{ plural(visibleLogs().length, 'registro', 'registros') }} de {{ logs().length }} carregados</span>
          </div>
        }
      </section>
    }

    <ng-template #idCell let-value>
      @if (value) {
        <button class="id-chip" type="button" [title]="value + ' (clique para copiar)'" (click)="copyId(value)">
          <code>{{ shortId(value) }}</code><sid3-icon name="copy" size="sm" />
        </button>
      } @else {
        <span class="muted">—</span>
      }
    </ng-template>
  `,
  styles: [
    `
      .id-chip { align-items: center; background: none; border: 0; border-radius: var(--radius-sm); color: var(--color-ink-2); cursor: pointer; display: inline-flex; gap: 4px; padding: 2px 4px; }
      .id-chip code { font-size: var(--text-xs); }
      .id-chip sid3-icon { color: var(--color-muted); opacity: 0; transition: opacity var(--dur-fast) var(--ease-out); }
      .id-chip:hover { background: var(--color-soft); }
      .id-chip:hover sid3-icon, .id-chip:focus-visible sid3-icon { opacity: 1; }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LogsPageComponent {
  protected readonly projectContext = inject(ProjectContextService);
  private readonly operationLogsService = inject(OperationLogsService);
  private readonly notifications = inject(NotificationService);

  protected readonly logs = signal<OperationLog[]>([]);
  protected readonly selectedProjectId = computed(() => this.projectContext.currentProjectId() ?? '');
  protected readonly limit = signal(50);
  protected readonly limitOptions = [25, 50, 100];
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<{ message: string; details: string | null } | null>(null);
  protected readonly query = signal('');
  protected readonly statusFilter = signal<'all' | 'SUCCESS' | 'FAILED'>('all');
  protected readonly operationFilter = signal<OperationType | ''>('');
  protected readonly sort = new TableSort<LogSortKey>('createdAt', 'desc');
  protected readonly plural = plural;

  protected readonly failedCount = computed(() => this.logs().filter((log) => log.status === 'FAILED').length);
  protected readonly operations = computed(() => [...new Set(this.logs().map((log) => log.operation))]);

  protected readonly visibleLogs = computed(() => {
    const query = this.query();
    const status = this.statusFilter();
    const operation = this.operationFilter();
    const rows = this.logs().filter(
      (log) =>
        (status === 'all' || log.status === status) &&
        (!operation || log.operation === operation) &&
        matchesQuery(query, log.requestId, log.bucketId, log.objectId, log.errorCode, this.operationLabel(log.operation))
    );
    return this.sort.apply(rows, {
      operation: (log) => this.operationLabel(log.operation),
      createdAt: (log) => log.createdAt
    });
  });

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
    const value = Number((event.target as HTMLSelectElement).value);
    this.limit.set(Number.isInteger(value) ? Math.min(Math.max(value, 1), 100) : 50);
    this.loadLogs();
  }

  loadLogs(): void {
    const projectId = this.selectedProjectId();
    if (!projectId) {
      return;
    }

    this.loadError.set(null);
    this.isLoading.set(true);
    this.operationLogsService
      .listLogs(projectId, this.limit())
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (logs) => this.logs.set(logs),
        error: (error: unknown) => this.loadError.set({ message: toApiErrorMessage(error), details: toApiErrorDetails(error) })
      });
  }

  clearFilters(): void {
    this.query.set('');
    this.statusFilter.set('all');
    this.operationFilter.set('');
  }

  protected copyId(value: string): void {
    void navigator.clipboard.writeText(value).then(() => this.notifications.success('ID copiado.', 2000));
  }

  protected operationLabel(operation: string): string {
    return OPERATION_LABELS[operation as OperationType] ?? operation;
  }

  protected shortId(value: string): string {
    return value.length > 12 ? `${value.slice(0, 8)}…` : value;
  }
}
