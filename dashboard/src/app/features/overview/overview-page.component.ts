import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, filter, finalize, of, switchMap, tap } from 'rxjs';
import { toApiErrorDetails, toApiErrorMessage } from '../../core/api/api-error';
import { ProjectContextService } from '../../core/project-context/project-context.service';
import { ErrorStateComponent } from '../../shared/ui/error-state.component';
import { formatBytes, formatCount, plural } from '../../shared/ui/format';
import { IconComponent } from '../../shared/ui/icon.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { SkeletonComponent } from '../../shared/ui/skeleton.component';
import { NoProjectStateComponent } from '../../shared/ui/no-project-state.component';
import { ProjectAlert, ProjectOverview } from '../projects/project.models';
import { ProjectsService } from '../projects/projects.service';

@Component({
  selector: 'sid3-overview-page',
  imports: [RouterLink, NoProjectStateComponent, PageHeaderComponent, IconComponent, SkeletonComponent, ErrorStateComponent],
  template: `
    @if (projectContext.loaded() && !projectContext.currentProject()) {
      <sid3-page-header title="Início" />
      <sid3-no-project-state />
    } @else {
      <sid3-page-header [title]="projectContext.currentProject()?.name ?? 'Início'" description="Visão geral do projeto">
        <button class="btn" type="button" [disabled]="isLoading()" (click)="reload()">
          <sid3-icon name="refresh" [spin]="isLoading()" />{{ isLoading() ? 'Atualizando...' : 'Atualizar' }}
        </button>
        <a class="btn btn--primary" routerLink="/files"><sid3-icon name="upload" />Enviar arquivos</a>
      </sid3-page-header>

      @if (overview(); as data) {
        @if (errorMessage()) {
          <div class="callout callout--danger" role="alert">
            <sid3-icon name="alert" />
            <span class="callout__text">Não foi possível atualizar. Estes são os últimos dados carregados.</span>
            <button class="btn btn--sm" type="button" (click)="reload()">Tentar novamente</button>
          </div>
        }

        @if (data.alerts.length > 0) {
          <section class="stack-sm" aria-label="Problemas que precisam de atenção">
            @for (alert of data.alerts; track $index) {
              <div [class]="'callout callout--' + alertTone(alert)" role="alert">
                <sid3-icon [name]="alert.severity === 'info' ? 'info' : 'alert'" />
                <span class="callout__text">{{ alert.message }}</span>
                <a class="btn btn--sm" [routerLink]="alertLink(alert)">{{ alertAction(alert) }}</a>
              </div>
            }
          </section>
        }

        <section class="kpis" [style.opacity]="isLoading() ? 0.6 : 1" aria-label="Números do projeto">
          <article class="card kpi">
            <div class="kpi__top">Arquivos<span class="kpi__icon"><sid3-icon name="file" /></span></div>
            <div class="kpi__value">{{ count(data.totals.objectCount) }}</div>
            <div class="kpi__foot">{{ plural(data.totals.bucketCount, 'bucket', 'buckets') }}</div>
          </article>
          <article class="card kpi">
            <div class="kpi__top">Espaço usado<span class="kpi__icon"><sid3-icon name="db" /></span></div>
            <div class="kpi__value">{{ bytes(data.totals.totalBytes) }}</div>
            <div class="kpi__foot"><a routerLink="/stats">Ver por conta →</a></div>
          </article>
          <article class="card kpi">
            <div class="kpi__top">Envios em 24h<span class="kpi__icon"><sid3-icon name="upload" /></span></div>
            <div class="kpi__value">{{ count(data.totals.uploads24h) }}</div>
            <div class="kpi__foot">
              @if (data.totals.failedUploads24h > 0) {
                <a class="is-bad" routerLink="/logs">{{ plural(data.totals.failedUploads24h, 'falha', 'falhas') }} →</a>
              } @else if (data.totals.uploads24h > 0) {
                Nenhuma falha
              } @else {
                Nenhum envio ainda
              }
            </div>
          </article>
          <article class="card kpi">
            <div class="kpi__top">Contas do Drive<span class="kpi__icon"><sid3-icon name="drive" /></span></div>
            <div class="kpi__value">{{ count(data.totals.connectionCount) }}</div>
            <div class="kpi__foot"><a routerLink="/storage">Gerenciar →</a></div>
          </article>
        </section>

        @if (!isSetupComplete(data)) {
          <section class="card">
            <div class="card__header">
              <div>
                <h2 class="card__title">Configurar este projeto</h2>
                <div class="cluster card__desc" style="gap: var(--space-3)">
                  <span>{{ setupDone(data) }} de 4 concluídos</span>
                  <span class="meter" style="width: 140px"><span [style.width.%]="setupDone(data) * 25"></span></span>
                </div>
              </div>
            </div>
            <ol class="setup">
              @for (step of setupSteps(data); track step.label; let index = $index) {
                <li class="setup__step" [class.is-done]="step.done">
                  <span class="setup__dot" aria-hidden="true">
                    @if (step.done) {
                      <sid3-icon name="check" size="sm" />
                    } @else {
                      {{ index + 1 }}
                    }
                  </span>
                  <span class="setup__text">
                    {{ step.label }}
                    @if (step.optional) {
                      <span class="tag">Opcional</span>
                    }
                    <span class="sr-only">{{ step.done ? '(concluído)' : '(pendente)' }}</span>
                  </span>
                  @if (!step.done) {
                    <a [class]="step.optional ? 'btn btn--sm btn--ghost' : 'btn btn--sm'" [routerLink]="step.link">{{ step.action }}</a>
                  }
                </li>
              }
            </ol>
          </section>
        }
      } @else if (errorMessage()) {
        <section class="card">
          <sid3-error-state title="Não foi possível carregar o resumo" [message]="errorMessage()!" [details]="errorDetails()" [busy]="isLoading()" (retry)="reload()" />
        </section>
      } @else {
        <sid3-skeleton variant="kpis" [count]="4" label="Carregando resumo do projeto" />
      }
    }
  `,
  styles: [
    `
      .setup { display: grid; gap: 2px; list-style: none; margin: 0; padding: var(--space-3) var(--space-3) var(--space-4); }
      .setup__step { align-items: center; border-radius: var(--radius-md); display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-3); min-height: 44px; padding: var(--space-1) var(--space-2); }
      .setup__step:hover { background: var(--color-soft); }
      .setup__dot { align-items: center; border: 1.5px solid var(--color-line-strong); border-radius: 50%; color: var(--color-muted); display: inline-flex; flex-shrink: 0; font-size: var(--text-xs); font-weight: var(--weight-semibold); height: 24px; justify-content: center; width: 24px; }
      .setup__step.is-done .setup__dot { background: var(--color-accent); border-color: var(--color-accent); color: var(--color-on-accent); }
      .setup__text { align-items: center; display: flex; flex: 1 1 200px; flex-wrap: wrap; gap: var(--space-2); min-width: 0; }
      .setup__step.is-done .setup__text { color: var(--color-muted); }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OverviewPageComponent {
  protected readonly projectContext = inject(ProjectContextService);
  private readonly projectsService = inject(ProjectsService);

  protected readonly overview = signal<ProjectOverview | null>(null);
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly errorDetails = signal<string | null>(null);
  protected readonly plural = plural;
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

  protected setupSteps(data: ProjectOverview) {
    return [
      { label: 'Adicione uma conta do Google Drive ao projeto', done: data.setup.hasConnection, link: '/storage', action: 'Ir para Armazenamento', optional: false },
      { label: 'Crie um bucket (a pasta onde os arquivos ficam)', done: data.setup.hasBucket, link: '/storage', action: 'Criar bucket', optional: false },
      { label: 'Envie o primeiro arquivo', done: data.setup.hasObject, link: '/files', action: 'Ir para Arquivos', optional: false },
      { label: 'Gere uma chave de API para enviar de outros sistemas', done: data.setup.hasApiKey, link: '/api-keys', action: 'Chaves de API', optional: true }
    ];
  }

  protected setupDone(data: ProjectOverview): number {
    return [data.setup.hasConnection, data.setup.hasBucket, data.setup.hasObject, data.setup.hasApiKey].filter(Boolean).length;
  }

  protected alertTone(alert: ProjectAlert): string {
    return alert.severity === 'critical' ? 'danger' : alert.severity === 'warning' ? 'warn' : 'info';
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
        this.errorDetails.set(toApiErrorDetails(error));
        return of(null);
      }),
      finalize(() => this.isLoading.set(false))
    );
  }
}
