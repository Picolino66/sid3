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
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { ErrorStateComponent } from '../../shared/ui/error-state.component';
import { plural } from '../../shared/ui/format';
import { IconComponent } from '../../shared/ui/icon.component';
import { MenuComponent } from '../../shared/ui/menu.component';
import { NoProjectStateComponent } from '../../shared/ui/no-project-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { SkeletonComponent } from '../../shared/ui/skeleton.component';
import { ConfirmService } from '../../shared/ui/confirm.service';
import { matchesQuery, TableSort } from '../../shared/ui/table-sort';

const STATUS_LABELS: Record<ShareLinkStatus, { label: string; tone: string }> = {
  ACTIVE: { label: 'Ativo', tone: 'success' },
  EXPIRED: { label: 'Expirado', tone: 'warn' },
  REVOKED: { label: 'Desativado', tone: 'neutral' }
};

type ShareSortKey = 'name' | 'accessCount' | 'createdAt';

@Component({
  selector: 'sid3-share-links-page',
  imports: [DatePipe, RouterLink, EmptyStateComponent, ErrorStateComponent, IconComponent, MenuComponent, NoProjectStateComponent, PageHeaderComponent, SkeletonComponent],
  template: `
    <sid3-page-header title="Links compartilhados" description="Links públicos gerados a partir do Meu Drive. Quem tiver o link pode ver e baixar os itens.">
      <a class="btn btn--primary" routerLink="/drive"><sid3-icon name="plus" />Compartilhar itens</a>
    </sid3-page-header>

    @if (projectContext.loaded() && !projectContext.currentProjectId()) {
      <sid3-no-project-state />
    } @else {
      <section class="card">
        @if (isLoading() && links().length === 0) {
          <sid3-skeleton [count]="4" label="Carregando links" />
        } @else if (errorMessage()) {
          <sid3-error-state title="Não foi possível carregar os links" [message]="errorMessage()!" (retry)="reload()" />
        } @else if (projectLinks().length === 0) {
          <sid3-empty-state
            icon="link"
            title="Você ainda não compartilhou nada"
            description="No Meu Drive, selecione arquivos ou pastas e clique em Gerar link público."
          >
            <a class="btn btn--primary" routerLink="/drive">Ir para o Meu Drive</a>
          </sid3-empty-state>
        } @else {
          <div class="toolbar">
            <div class="toolbar__group">
              <label class="input-icon toolbar__search">
                <span class="sr-only">Buscar link</span>
                <sid3-icon name="search" />
                <input class="input input--sm" type="search" placeholder="Buscar por nome ou item" [value]="query()" (input)="query.set($any($event.target).value)" />
              </label>
              <div class="segmented" role="group" aria-label="Filtrar por status">
                <button type="button" [attr.aria-pressed]="!showInactive()" (click)="showInactive.set(false)">Ativos ({{ activeCount() }})</button>
                <button type="button" [attr.aria-pressed]="showInactive()" (click)="showInactive.set(true)">Todos ({{ projectLinks().length }})</button>
              </div>
            </div>
          </div>
          <div class="table-wrap">
            <table class="table table--responsive">
              <thead>
                <tr>
                  <th [attr.aria-sort]="sort.aria('name')">
                    <button class="sort-btn" type="button" (click)="sort.toggle('name')">Link <sid3-icon [name]="sort.icon('name')" size="sm" /></button>
                  </th>
                  <th>Itens</th>
                  <th>Status</th>
                  <th class="num" [attr.aria-sort]="sort.aria('accessCount')">
                    <button class="sort-btn" type="button" (click)="sort.toggle('accessCount')">Acessos <sid3-icon [name]="sort.icon('accessCount')" size="sm" /></button>
                  </th>
                  <th [attr.aria-sort]="sort.aria('createdAt')">
                    <button class="sort-btn" type="button" (click)="sort.toggle('createdAt')">Criado / validade <sid3-icon [name]="sort.icon('createdAt')" size="sm" /></button>
                  </th>
                  <th class="col-actions"><span class="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                @for (link of visibleLinks(); track link.id) {
                  <tr>
                    <td class="cell-primary">
                      <div class="cell-main" style="max-width: 320px">
                        <strong class="truncate">{{ link.name ?? 'Sem nome' }}</strong>
                        <span class="truncate mono" [title]="url(link)">{{ url(link) }}</span>
                      </div>
                    </td>
                    <td data-label="Itens">
                      <div class="cell-main" style="max-width: 260px">
                        <span class="truncate" style="color: var(--color-ink); font-size: var(--text-sm)" [title]="itemNames(link)">{{ plural(link.items.length, 'item', 'itens') }} · {{ itemNames(link) }}</span>
                        @if (unavailableCount(link) > 0) {
                          <span class="text-danger">{{ unavailableCount(link) }} indisponível(is) no Drive</span>
                        }
                      </div>
                    </td>
                    <td data-label="Status"><span [class]="'chip chip--' + statusTone(link)">{{ statusLabel(link) }}</span></td>
                    <td data-label="Acessos" class="num">
                      <div class="cell-main" style="justify-items: end">
                        <span style="color: var(--color-ink); font-size: var(--text-sm)">{{ link.accessCount }}</span>
                        @if (link.lastAccessedAt) {
                          <span>último {{ link.lastAccessedAt | date: 'dd/MM HH:mm' }}</span>
                        }
                      </div>
                    </td>
                    <td data-label="Criado / validade">
                      <div class="cell-main">
                        <span style="color: var(--color-ink); font-size: var(--text-sm)">{{ link.expiresAt ? 'Até ' + (link.expiresAt | date: 'dd/MM/yyyy HH:mm') : 'Sem expiração' }}</span>
                        <span>Criado em {{ link.createdAt | date: 'dd/MM/yyyy' }}</span>
                      </div>
                    </td>
                    <td class="col-actions">
                      @if (link.status === 'ACTIVE') {
                        <div class="cell-actions">
                          <button class="btn btn--ghost btn--icon btn--sm" type="button" data-tooltip="Copiar link" data-tooltip-pos="left" [attr.aria-label]="'Copiar ' + (link.name ?? 'link')" (click)="copy(link)">
                            <sid3-icon name="copy" />
                          </button>
                          <sid3-menu [label]="'Ações de ' + (link.name ?? 'link')">
                            <a class="menu-item" role="menuitem" [href]="url(link)" target="_blank" rel="noopener"><sid3-icon name="external" />Abrir página pública</a>
                            <button class="menu-item" type="button" role="menuitem" (click)="copy(link)"><sid3-icon name="copy" />Copiar link</button>
                            <hr class="menu-sep" />
                            <button class="menu-item menu-item--danger" type="button" role="menuitem" [disabled]="revokingId() === link.id" (click)="revoke(link)">
                              <sid3-icon name="ban" />Desativar link
                            </button>
                          </sid3-menu>
                        </div>
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="6">
                      <sid3-empty-state icon="search" title="Nenhum link com esses filtros" [compact]="true">
                        <button class="btn btn--sm" type="button" (click)="query.set(''); showInactive.set(true)">Mostrar todos</button>
                      </sid3-empty-state>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ShareLinksPageComponent {
  private readonly shareLinksService = inject(ShareLinksService);
  private readonly notificationService = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly confirm = inject(ConfirmService);
  protected readonly plural = plural;
  protected readonly query = signal('');
  protected readonly sort = new TableSort<ShareSortKey>('createdAt', 'desc');

  protected readonly links = signal<ShareLink[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly revokingId = signal<string | null>(null);
  protected readonly showInactive = signal(false);

  protected readonly projectContext = inject(ProjectContextService);
  private readonly projectsService = inject(ProjectsService);
  /** Contas do projeto atual: só os links dessas contas aparecem. */
  private readonly projectConnectionIds = signal<Set<string> | null>(null);

  protected readonly projectLinks = computed(() => {
    const allowed = this.projectConnectionIds();
    return allowed ? this.links().filter((link) => allowed.has(link.connectionId)) : [];
  });

  protected readonly activeCount = computed(() => this.projectLinks().filter((link) => link.status === 'ACTIVE').length);

  protected readonly visibleLinks = computed(() => {
    const inProject = this.projectLinks();
    const query = this.query();
    const rows = (this.showInactive() ? inProject : inProject.filter((link) => link.status === 'ACTIVE')).filter((link) =>
      matchesQuery(query, link.name, ...link.items.map((item) => item.name))
    );
    return this.sort.apply(rows, {
      name: (link) => link.name,
      accessCount: (link) => link.accessCount,
      createdAt: (link) => link.createdAt
    });
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

    this.reload();
  }

  reload(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);
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

  protected statusTone(link: ShareLink): string {
    return STATUS_LABELS[link.status].tone;
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

  protected async revoke(link: ShareLink): Promise<void> {
    const label = link.name ? `"${link.name}"` : 'este link';
    const confirmed = await this.confirm.ask({
      title: `Desativar ${label}?`,
      message: 'Quem tiver o link perde o acesso na hora. Os arquivos continuam no seu Drive.',
      confirmLabel: 'Desativar link'
    });
    if (!confirmed) {
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
