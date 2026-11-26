import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, filter, finalize, of, switchMap, tap } from 'rxjs';
import { toApiErrorMessage } from '../../core/api/api-error';
import { ProjectContextService } from '../../core/project-context/project-context.service';
import { formatBytes, formatCount } from '../../shared/ui/format';
import { NoProjectStateComponent } from '../../shared/ui/no-project-state.component';
import { ProjectAlert, ProjectOverview } from '../projects/project.models';
import { ProjectsService } from '../projects/projects.service';

@Component({
  selector: 'sid3-overview-page',
  imports: [RouterLink, NoProjectStateComponent],
  template: `
    @if (projectContext.loaded() && !projectContext.currentProject()) {
      <header class="topbar"><h1>Início</h1></header>
      <sid3-no-project-state />
    } @else {
      <header class="topbar">
        <div>
          <p class="eyebrow">Projeto</p>
          <h1>{{ projectContext.currentProject()?.name ?? 'Início' }}</h1>
        </div>
        <button type="button" class="secondary" [disabled]="isLoading()" (click)="reload()">
          {{ isLoading() ? 'Atualizando...' : 'Atualizar' }}
        </button>
      </header>

      @if (errorMessage()) {
        <p class="form-error">{{ errorMessage() }}</p>
      }

      @if (overview(); as data) {
        @if (data.alerts.length > 0) {
          <section class="alert-list" aria-label="Problemas que precisam de atenção">
            @for (alert of data.alerts; track $index) {
              <div [class]="'alert alert--' + alert.severity" role="alert">
                <span>{{ alert.message }}</span>
                <a [routerLink]="alertLink(alert)">{{ alertAction(alert) }}</a>
              </div>
            }
          </section>
        } @else {
          <p class="all-good">Tudo certo: nenhuma conexão ou bucket precisa de atenção.</p>
        }

        <section class="stats-kpi-row overview-kpis">
          <article class="kpi-card">
            <span class="kpi-label">Arquivos</span>
            <span class="kpi-value">{{ count(data.totals.objectCount) }}</span>
          </article>
          <article class="kpi-card">
            <span class="kpi-label">Espaço usado</span>
            <span class="kpi-value">{{ bytes(data.totals.totalBytes) }}</span>
          </article>
          <article class="kpi-card">
            <span class="kpi-label">Envios nas últimas 24h</span>
            <span class="kpi-value">{{ data.totals.uploads24h }}</span>
            @if (data.totals.failedUploads24h > 0) {
              <a class="kpi-foot danger-text" routerLink="/logs">{{ data.totals.failedUploads24h }} com falha</a>
            }
          </article>
          <article class="kpi-card">
            <span class="kpi-label">Contas do Drive no projeto</span>
            <span class="kpi-value">{{ data.totals.connectionCount }}</span>
            <a class="kpi-foot" routerLink="/storage">{{ data.totals.bucketCount }} bucket(s)</a>
          </article>
        </section>

        @if (!isSetupComplete(data)) {
          <section class="setup-guide panel">
            <h2>Configurar este projeto</h2>
            <ol class="setup-steps">
              <li [class]="data.setup.hasConnection ? 'step done' : 'step'">
                <span [class]="data.setup.hasConnection ? 'step-check' : 'step-number'">{{ data.setup.hasConnection ? '✓' : '1' }}</span>
                <span>Adicione uma conta do Google Drive ao projeto</span>
                @if (!data.setup.hasConnection) {
                  <a routerLink="/storage" class="step-link">Ir para Armazenamento</a>
                }
              </li>
              <li [class]="data.setup.hasBucket ? 'step done' : 'step'">
                <span [class]="data.setup.hasBucket ? 'step-check' : 'step-number'">{{ data.setup.hasBucket ? '✓' : '2' }}</span>
                <span>Crie um bucket (a pasta onde os arquivos ficam)</span>
                @if (!data.setup.hasBucket) {
                  <a routerLink="/storage" class="step-link">Criar bucket</a>
                }
              </li>
              <li [class]="data.setup.hasObject ? 'step done' : 'step'">
                <span [class]="data.setup.hasObject ? 'step-check' : 'step-number'">{{ data.setup.hasObject ? '✓' : '3' }}</span>
                <span>Envie o primeiro arquivo</span>
                @if (!data.setup.hasObject) {
                  <a routerLink="/files" class="step-link">Ir para Arquivos</a>
                }
              </li>
              <li [class]="data.setup.hasApiKey ? 'step done' : 'step'">
                <span [class]="data.setup.hasApiKey ? 'step-check' : 'step-number'">{{ data.setup.hasApiKey ? '✓' : '4' }}</span>
                <span>Opcional: gere uma chave de API para enviar arquivos de outros sistemas</span>
                @if (!data.setup.hasApiKey) {
                  <a routerLink="/api-keys" class="step-link">Chaves de API</a>
                }
              </li>
            </ol>
          </section>
        }
      } @else if (isLoading()) {
        <p class="muted">Carregando resumo do projeto...</p>
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OverviewPageComponent {
  protected readonly projectContext = inject(ProjectContextService);
  private readonly projectsService = inject(ProjectsService);

  protected readonly overview = signal<ProjectOverview | null>(null);
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  private readonly reloadTick = signal(0);

  constructor() {
    toObservable(this.projectContext.currentProjectId)
      .pipe(
        filter((projectId): projectId is string => Boolean(projectId)),
        switchMap((projectId) => this.load(projectId)),
        takeUntilDestroyed()
      )
      .subscribe();
    toObservable(this.reloadTick)
      .pipe(
        filter((tick) => tick > 0),
        switchMap(() => this.load(this.projectContext.currentProjectId())),
        takeUntilDestroyed()
      )
      .subscribe();
  }

  reload(): void {
    this.reloadTick.update((tick) => tick + 1);
  }

  protected count(value: number): string {
    return formatCount(value);
  }

  protected bytes(value: number): string {
    return formatBytes(value);
  }

  protected isSetupComplete(data: ProjectOverview): boolean {
    return data.setup.hasConnection && data.setup.hasBucket && data.setup.hasObject;
  }

  protected alertLink(alert: ProjectAlert): string {
    if (alert.code === 'UPLOAD_FAILURES') return '/logs';
    if (alert.code === 'BUCKET_CONNECTION_NOT_LINKED') return '/storage';
    return '/connections';
  }

  protected alertAction(alert: ProjectAlert): string {
    if (alert.code === 'UPLOAD_FAILURES') return 'Ver logs';
    if (alert.code === 'BUCKET_CONNECTION_NOT_LINKED') return 'Armazenamento';
    if (alert.code === 'SID3_FOLDER_PENDING') return 'Resolver';
    return 'Reconectar';
  }

  private load(projectId: string | null) {
    if (!projectId) return of(null);
    this.isLoading.set(true);
    this.errorMessage.set(null);
    return this.projectsService.getOverview(projectId).pipe(
      tap((overview) => this.overview.set(overview)),
      catchError((error: unknown) => {
        this.errorMessage.set(toApiErrorMessage(error));
        return of(null);
      }),
      finalize(() => this.isLoading.set(false))
    );
  }
}
