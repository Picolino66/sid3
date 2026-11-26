import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { finalize, of, switchMap } from 'rxjs';
import { ProjectContextService } from '../../core/project-context/project-context.service';
import { ProjectsService } from '../projects/projects.service';
import { toApiErrorMessage } from '../../core/api/api-error';
import { NotificationService } from '../../core/notifications/notification.service';
import { ShareLink, ShareLinkStatus, shareLinkUrl } from './share-link.models';
import { ShareLinksService } from './share-links.service';

const STATUS_LABELS: Record<ShareLinkStatus, { label: string; css: string }> = {
  ACTIVE: { label: 'Ativo', css: 'connected' },
  EXPIRED: { label: 'Expirado', css: 'error' },
  REVOKED: { label: 'Desativado', css: 'revoked' }
};

@Component({
  selector: 'sid3-share-links-page',
  imports: [DatePipe, RouterLink],
  template: `
    <header class="topbar">
      <div>
        <p class="eyebrow">{{ projectContext.currentProject()?.name ?? 'Projeto' }}</p>
        <h1>Links compartilhados</h1>
        <p class="muted">Links públicos gerados a partir de "Meu Drive". Quem tiver o link vê e baixa os itens.</p>
      </div>
      <a class="button-link" routerLink="/drive">Compartilhar mais itens</a>
    </header>

    @if (errorMessage()) {
      <p class="form-error">{{ errorMessage() }}</p>
    }

    <section class="panel">
      <header class="panel-header-row">
        <h2>Seus links</h2>
        <label class="share-filter">
          <input type="checkbox" [checked]="showInactive()" (change)="showInactive.set($any($event.target).checked)" />
          Mostrar expirados e desativados
        </label>
      </header>

      @if (isLoading()) {
        <p class="muted">Carregando links...</p>
      } @else if (visibleLinks().length === 0) {
        <div class="empty-cta">
          <p class="muted">
            {{ links().length === 0 ? 'Você ainda não compartilhou nada.' : 'Nenhum link ativo.' }}
            Selecione arquivos ou pastas em "Meu Drive" e clique em "Gerar link público".
          </p>
        </div>
      } @else {
        <div class="table share-links-table" role="table" aria-label="Links compartilhados">
          <div role="row" class="head">
            <span role="columnheader">Link</span>
            <span role="columnheader">Itens</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Acessos</span>
            <span role="columnheader">Criado / expira</span>
            <span role="columnheader">Ações</span>
          </div>
          @for (link of visibleLinks(); track link.id) {
            <div role="row">
              <span role="cell">
                <strong>{{ link.name ?? 'Sem nome' }}</strong>
                <code class="share-url" [title]="url(link)">{{ url(link) }}</code>
              </span>
              <span role="cell" class="share-items-cell" [title]="itemNames(link)">
                {{ link.items.length }} · {{ itemNames(link) }}
                @if (unavailableCount(link) > 0) {
                  <em class="field-hint--error">{{ unavailableCount(link) }} indisponível(is)</em>
                }
              </span>
              <span role="cell">
                <span [class]="'status-label ' + statusCss(link)">{{ statusLabel(link) }}</span>
              </span>
              <span role="cell">
                {{ link.accessCount }}
                @if (link.lastAccessedAt) {
                  <em class="muted">último {{ link.lastAccessedAt | date: 'dd/MM HH:mm' }}</em>
                }
              </span>
              <span role="cell">
                {{ link.createdAt | date: 'dd/MM/yyyy' }}
                <em class="muted">{{ link.expiresAt ? 'expira ' + (link.expiresAt | date: 'dd/MM/yyyy HH:mm') : 'sem expiração' }}</em>
              </span>
              <span role="cell" class="action-cell">
                @if (link.status === 'ACTIVE') {
                  <button class="compact-button" type="button" (click)="copy(link)">Copiar</button>
                  <a class="compact-link" [href]="url(link)" target="_blank" rel="noopener">Abrir</a>
                  <button
                    class="danger compact-button"
                    type="button"
                    [disabled]="revokingId() === link.id"
                    (click)="revoke(link)"
                  >
                    {{ revokingId() === link.id ? 'Desativando...' : 'Desativar' }}
                  </button>
                }
              </span>
            </div>
          }
        </div>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ShareLinksPageComponent {
  private readonly shareLinksService = inject(ShareLinksService);
  private readonly notificationService = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly links = signal<ShareLink[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly revokingId = signal<string | null>(null);
  protected readonly showInactive = signal(false);

  protected readonly projectContext = inject(ProjectContextService);
  private readonly projectsService = inject(ProjectsService);
  /** Contas do projeto atual: só os links dessas contas aparecem. */
  private readonly projectConnectionIds = signal<Set<string> | null>(null);

  protected readonly visibleLinks = computed(() => {
    const allowed = this.projectConnectionIds();
    const inProject = allowed ? this.links().filter((link) => allowed.has(link.connectionId)) : [];
    return this.showInactive() ? inProject : inProject.filter((link) => link.status === 'ACTIVE');
  });

  constructor() {
    toObservable(this.projectContext.currentProjectId)
      .pipe(
        switchMap((projectId) => (projectId ? this.projectsService.listProjectConnections(projectId) : of([]))),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (connections) => this.projectConnectionIds.set(new Set(connections.map((connection) => connection.connectionId))),
        error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
      });

    this.shareLinksService
      .listShareLinks()
      .pipe(
        finalize(() => this.isLoading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (links) => this.links.set(links),
        error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
      });
  }

  protected url(link: ShareLink): string {
    return shareLinkUrl(link);
  }

  protected statusLabel(link: ShareLink): string {
    return STATUS_LABELS[link.status].label;
  }

  protected statusCss(link: ShareLink): string {
    return STATUS_LABELS[link.status].css;
  }

  protected itemNames(link: ShareLink): string {
    const names = link.items.filter((item) => item.available).map((item) => item.name);
    return names.length > 3 ? `${names.slice(0, 3).join(', ')}...` : names.join(', ');
  }

  protected unavailableCount(link: ShareLink): number {
    return link.items.filter((item) => !item.available).length;
  }

  protected copy(link: ShareLink): void {
    navigator.clipboard.writeText(this.url(link)).then(
      () => this.notificationService.success('Link copiado!'),
      () => this.notificationService.error('Não foi possível copiar o link.')
    );
  }

  protected revoke(link: ShareLink): void {
    const label = link.name ?? 'este link';
    if (!window.confirm(`Desativar ${label}? Quem tiver o link perderá o acesso imediatamente.`)) {
      return;
    }

    this.revokingId.set(link.id);
    this.shareLinksService
      .revokeShareLink(link.id)
      .pipe(finalize(() => this.revokingId.set(null)))
      .subscribe({
        next: (revoked) => {
          this.links.update((links) => links.map((item) => (item.id === revoked.id ? revoked : item)));
          this.notificationService.success('Link desativado.');
        },
        error: (error: unknown) => this.notificationService.error(toApiErrorMessage(error))
      });
  }
}
