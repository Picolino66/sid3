import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { toApiErrorDetails, toApiErrorMessage } from '../../core/api/api-error';
import { ProjectContextService } from '../../core/project-context/project-context.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { ErrorStateComponent } from '../../shared/ui/error-state.component';
import { connectionStatusLabel, connectionStatusTone, formatBytes, formatCount, initials, plural } from '../../shared/ui/format';
import { IconComponent } from '../../shared/ui/icon.component';
import { NoProjectStateComponent } from '../../shared/ui/no-project-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { SkeletonComponent } from '../../shared/ui/skeleton.component';
import { TableSort } from '../../shared/ui/table-sort';
import { ProjectStorageStats } from './stats.models';
import { StatsService } from './stats.service';

type BucketSortKey = 'name' | 'size' | 'count';

function usagePercent(used: string, total: string): number {
  const usedN = Number(used);
  const totalN = Number(total);
  if (totalN === 0) return 0;
  return Math.min(100, Math.round((usedN / totalN) * 100));
}

@Component({
  selector: 'sid3-stats-page',
  imports: [EmptyStateComponent, ErrorStateComponent, IconComponent, NoProjectStateComponent, PageHeaderComponent, SkeletonComponent],
  template: `
    <sid3-page-header title="Estatísticas" description="Quanto este projeto guarda, em quais contas e em quais buckets.">
      @if (selectedProjectId()) {
        <button class="btn" type="button" [disabled]="isLoading()" (click)="reload()">
          <sid3-icon name="refresh" [spin]="isLoading()" />{{ isLoading() ? 'Atualizando...' : 'Atualizar' }}
        </button>
      }
    </sid3-page-header>

    @if (projectContext.loaded() && !selectedProjectId()) {
      <sid3-no-project-state />
    } @else if (stats(); as data) {
      <section class="kpis" [style.opacity]="isLoading() ? 0.6 : 1" aria-label="Totais do projeto">
        <article class="card kpi">
          <div class="kpi__top">Espaço usado<span class="kpi__icon"><sid3-icon name="db" /></span></div>
          <div class="kpi__value">{{ bytes(data.totalSizeBytes) }}</div>
          <div class="kpi__foot">guardado via SID3</div>
        </article>
        <article class="card kpi">
          <div class="kpi__top">Arquivos<span class="kpi__icon"><sid3-icon name="file" /></span></div>
          <div class="kpi__value">{{ count(data.totalObjectCount) }}</div>
          <div class="kpi__foot">{{ plural(data.byBucket.length, 'bucket', 'buckets') }}</div>
        </article>
        <article class="card kpi">
          <div class="kpi__top">Contas do Drive<span class="kpi__icon"><sid3-icon name="drive" /></span></div>
          <div class="kpi__value">{{ count(data.byConnection.length) }}</div>
          <div class="kpi__foot">no projeto</div>
        </article>
      </section>

      <div class="grid-2" style="align-items: start">
        <section class="card">
          <header class="card__header">
            <div>
              <h2 class="card__title">Por conta do Drive</h2>
              <p class="card__desc">Quanto o SID3 guardou em cada conta e a cota total do Google.</p>
            </div>
          </header>
          @if (data.byConnection.length === 0) {
            <sid3-empty-state icon="drive" title="Nenhuma conta com uso ainda" description="Os números aparecem depois dos primeiros envios." [compact]="true" />
          } @else {
            <ul class="row-list" style="margin-top: var(--space-3)">
              @for (conn of data.byConnection; track conn.connectionId) {
                <li class="row-item conn">
                  <div class="conn__head">
                    <span class="row-item__avatar" aria-hidden="true">{{ initials(conn.displayName ?? conn.providerAccountEmail) }}</span>
                    <div class="row-item__main">
                      <strong class="truncate">{{ conn.displayName ?? 'Google Drive' }}</strong>
                      <span class="row-item__meta truncate">{{ conn.providerAccountEmail ?? '—' }}</span>
                    </div>
                    <span [class]="'chip chip--' + statusTone(conn.status)">{{ statusLabel(conn.status) }}</span>
                  </div>
                  <div class="conn__numbers">
                    <div>
                      <span class="conn__label">Via SID3</span>
                      <strong class="tabular">{{ bytes(conn.sizeBytes) }}</strong>
                      <span class="muted text-xs">{{ plural(conn.objectCount, 'arquivo', 'arquivos') }}</span>
                    </div>
                    @if (conn.driveQuotaUsageBytes !== null) {
                      <div>
                        <span class="conn__label">Uso total do Drive</span>
                        <strong class="tabular">{{ bytes(conn.driveQuotaUsageBytes) }}</strong>
                        <span class="muted text-xs">{{ conn.driveQuotaLimitBytes ? 'de ' + bytes(conn.driveQuotaLimitBytes) : 'sem limite' }}</span>
                      </div>
                    }
                  </div>
                  @if (conn.driveQuotaUsageBytes !== null && conn.driveQuotaLimitBytes) {
                    @let percent = usagePercent(conn.driveQuotaUsageBytes, conn.driveQuotaLimitBytes);
                    <div class="conn__quota">
                      <div class="cluster cluster--between text-xs">
                        <span class="muted">Cota do Google Drive</span>
                        <span class="tabular" [class.text-danger]="percent >= 90">{{ percent }}%</span>
                      </div>
                      <div class="meter" [class.meter--warn]="percent >= 75 && percent < 90" [class.meter--danger]="percent >= 90" role="progressbar" [attr.aria-valuenow]="percent" aria-valuemin="0" aria-valuemax="100" aria-label="Cota do Google Drive usada">
                        <span [style.width.%]="percent"></span>
                      </div>
                    </div>
                  }
                </li>
              }
            </ul>
          }
        </section>

        <section class="card">
          <header class="card__header">
            <div>
              <h2 class="card__title">Por bucket</h2>
              <p class="card__desc">Tamanho e quantidade de arquivos de cada bucket.</p>
            </div>
          </header>
          @if (data.byBucket.length === 0) {
            <sid3-empty-state icon="folder" title="Nenhum bucket com dados ainda" [compact]="true" />
          } @else {
            <div class="table-wrap" style="margin-top: var(--space-3)">
              <table class="table table--responsive">
                <thead>
                  <tr>
                    <th [attr.aria-sort]="sort.aria('name')"><button class="sort-btn" type="button" (click)="sort.toggle('name')">Bucket <sid3-icon [name]="sort.icon('name')" size="sm" /></button></th>
                    <th class="num" [attr.aria-sort]="sort.aria('size')"><button class="sort-btn" type="button" (click)="sort.toggle('size')">Tamanho <sid3-icon [name]="sort.icon('size')" size="sm" /></button></th>
                    <th class="num" [attr.aria-sort]="sort.aria('count')"><button class="sort-btn" type="button" (click)="sort.toggle('count')">Arquivos <sid3-icon [name]="sort.icon('count')" size="sm" /></button></th>
                  </tr>
                </thead>
                <tbody>
                  @for (bucket of buckets(); track bucket.bucketId) {
                    <tr>
                      <td class="cell-primary">
                        <div class="cell-main">
                          <strong class="mono truncate" style="min-width: 140px">{{ bucket.bucketName }}</strong>
                          <span class="meter meter--slim" style="max-width: 180px" aria-hidden="true"><span [style.width.%]="share(bucket.sizeBytes, data.totalSizeBytes)"></span></span>
                        </div>
                      </td>
                      <td class="num" data-label="Tamanho">{{ bytes(bucket.sizeBytes) }}</td>
                      <td class="num" data-label="Arquivos">{{ count(bucket.objectCount) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>
      </div>
    } @else if (errorMessage()) {
      <section class="card">
        <sid3-error-state title="Não foi possível carregar as estatísticas" [message]="errorMessage()!" [details]="errorDetails()" [busy]="isLoading()" (retry)="reload()" />
      </section>
    } @else {
      <sid3-skeleton variant="kpis" [count]="3" label="Carregando estatísticas" />
    }
  `,
  styles: [
    `
      .conn { align-items: stretch; display: grid; gap: var(--space-3); }
      .conn__head { align-items: center; display: flex; gap: var(--space-3); min-width: 0; }
      .conn__numbers { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-8); padding-left: calc(36px + var(--space-3)); }
      .conn__numbers > div { display: grid; gap: 2px; }
      .conn__numbers strong { font-size: var(--text-lg); font-weight: var(--weight-semibold); }
      .conn__label { color: var(--color-muted); font-size: var(--text-xs); }
      .conn__quota { display: grid; gap: 6px; padding-left: calc(36px + var(--space-3)); }
      @media (max-width: 640px) { .conn__numbers, .conn__quota { padding-left: 0; } }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StatsPageComponent {
  protected readonly projectContext = inject(ProjectContextService);
  private readonly statsService = inject(StatsService);

  protected readonly selectedProjectId = computed(() => this.projectContext.currentProjectId() ?? '');
  protected readonly stats = signal<ProjectStorageStats | null>(null);
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly errorDetails = signal<string | null>(null);
  protected readonly sort = new TableSort<BucketSortKey>('size', 'desc');

  protected readonly usagePercent = usagePercent;
  protected readonly initials = initials;
  protected readonly plural = plural;
  protected readonly statusLabel = connectionStatusLabel;
  protected readonly statusTone = connectionStatusTone;

  protected readonly buckets = computed(() =>
    this.sort.apply(this.stats()?.byBucket ?? [], {
      name: (bucket) => bucket.bucketName,
      size: (bucket) => Number(bucket.sizeBytes),
      count: (bucket) => bucket.objectCount
    })
  );

  constructor() {
    toObservable(this.projectContext.currentProjectId)
      .pipe(takeUntilDestroyed())
      .subscribe((projectId) => {
        if (projectId) {
          this.stats.set(null);
          this.loadStats(projectId);
        } else {
          this.isLoading.set(false);
        }
      });
  }

  reload(): void {
    const projectId = this.selectedProjectId();
    if (projectId) this.loadStats(projectId);
  }

  protected bytes(value: string | number | null): string {
    return formatBytes(value === null ? null : Number(value));
  }

  protected count(value: number): string {
    return formatCount(value);
  }

  protected share(part: string, total: string): number {
    const totalN = Number(total);
    return totalN > 0 ? Math.max(2, Math.round((Number(part) / totalN) * 100)) : 0;
  }

  private loadStats(projectId: string): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.statsService
      .getProjectStorageStats(projectId)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (stats) => this.stats.set(stats),
        error: (error: unknown) => {
          this.errorMessage.set(toApiErrorMessage(error));
          this.errorDetails.set(toApiErrorDetails(error));
        }
      });
  }
}
