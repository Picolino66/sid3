import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { debounceTime, distinctUntilChanged, firstValueFrom, map, Subscription } from 'rxjs';
import { toApiErrorMessage } from '../../core/api/api-error';
import { formatBytes } from '../drive/drive-file.presenter';
import { PublicMediaViewerComponent } from './public-media-viewer.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { ErrorStateComponent } from '../../shared/ui/error-state.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { SkeletonComponent } from '../../shared/ui/skeleton.component';
import { PublicFolderList, PublicSearchItem, PublicSearchResult, PublicShare, PublicShareItem } from './share-link.models';
import { ShareLinksService } from './share-links.service';

const MIN_SEARCH_LENGTH = 2;
const PREVIEW_ICONS: Record<string, string> = { image: 'image', video: 'video', audio: 'music' };

/**
 * Página aberta por qualquer pessoa com o link (fora do login e do layout do dashboard).
 * A API valida em toda chamada que a pasta/arquivo pertence ao link.
 */
@Component({
  selector: 'sid3-public-share-page',
  imports: [DatePipe, ReactiveFormsModule, PublicMediaViewerComponent, EmptyStateComponent, ErrorStateComponent, IconComponent, SkeletonComponent],
  template: `
    <main class="public">
      <header class="public__header">
        <span class="brand__mark" aria-hidden="true">S3</span>
        <div style="min-width: 0">
          <h1 class="page-header__title">{{ share()?.name ?? 'Arquivos compartilhados' }}</h1>
          @if (share(); as current) {
            <p class="muted text-sm">
              @if (current.sharedBy) {
                Compartilhado por {{ current.sharedBy }} ·
              }
              {{ current.createdAt | date: 'dd/MM/yyyy' }}
              @if (current.expiresAt) {
                · disponível até {{ current.expiresAt | date: 'dd/MM/yyyy HH:mm' }}
              }
            </p>
          }
        </div>
      </header>

      @if (isLoading() && !share()) {
        <section class="card"><sid3-skeleton [count]="6" label="Carregando arquivos compartilhados" /></section>
      } @else if (fatalError(); as failure) {
        <section class="card">
          <sid3-error-state [title]="failure.title" [message]="failure.message" icon="unlink" [retryable]="false" />
        </section>
      } @else if (share()) {
        <section class="card">
          <div class="toolbar">
            @if (search(); as result) {
              <p class="text-sm" aria-live="polite">
                {{ result.total }} {{ result.total === 1 ? 'resultado' : 'resultados' }} para “{{ result.query }}”
                <button class="btn btn--link btn--sm" type="button" style="margin-left: var(--space-2)" (click)="clearSearch()">Limpar busca</button>
              </p>
            } @else {
              <nav class="crumbs" aria-label="Caminho">
                <button class="crumbs__item" type="button" [attr.aria-current]="!folder() ? 'page' : null" (click)="openRoot()">Itens compartilhados</button>
                @for (crumb of folder()?.breadcrumb ?? []; track crumb.id; let last = $last) {
                  <sid3-icon class="crumbs__sep" name="chev" size="sm" />
                  <button class="crumbs__item" type="button" [attr.aria-current]="last ? 'page' : null" (click)="openFolder(crumb.id)">{{ crumb.name }}</button>
                }
              </nav>
            }
            <div class="toolbar__group" style="flex: 1 1 320px; justify-content: flex-end">
              <label class="input-icon toolbar__search">
                <span class="sr-only">Buscar nas pastas e arquivos do link</span>
                <sid3-icon name="search" />
                <input class="input input--sm" type="search" [formControl]="searchControl" placeholder="Buscar pastas e arquivos" aria-describedby="public-search-hint" />
              </label>
              @if (!search()) {
                @if (folder(); as current) {
                  <a class="btn btn--sm btn--primary" [href]="folderZipUrl(current.folder.id)" rel="nofollow"><sid3-icon name="archive" />Baixar pasta (ZIP)</a>
                } @else if (items().length > 0) {
                  <a class="btn btn--sm btn--primary" [href]="shareZipUrl()" rel="nofollow"><sid3-icon name="archive" />Baixar tudo (ZIP)</a>
                }
              }
            </div>
          </div>

          @if (searchHint()) {
            <p class="field__hint" id="public-search-hint" style="padding: 0 var(--space-5) var(--space-3)">{{ searchHint() }}</p>
          }
          @if (errorMessage()) {
            <div style="padding: 0 var(--space-5) var(--space-3)">
              <div class="callout callout--danger" role="alert"><sid3-icon name="alert" /><span class="callout__text">{{ errorMessage() }}</span></div>
            </div>
          }

          @if (visibleItems().length === 0) {
            <sid3-empty-state [icon]="search() ? 'search' : 'folder'" [title]="emptyMessage()" [compact]="true" />
          } @else {
            <div class="table-wrap" [attr.aria-busy]="isLoading()" [style.opacity]="isLoading() ? 0.6 : 1">
              <table class="table table--responsive">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th class="num">Tamanho</th>
                    <th>{{ search() ? 'Local' : 'Modificado em' }}</th>
                    <th class="col-actions"><span class="sr-only">Ações</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (item of visibleItems(); track item.id) {
                    <tr>
                      <td class="cell-primary">
                        <div class="file-name">
                          <sid3-icon [class]="'file-icon' + (item.isFolder ? ' is-folder' : '')" [name]="icon(item)" />
                          @if (item.isFolder) {
                            <button class="btn btn--link truncate name-btn" type="button" (click)="openFolder(item.id)">{{ item.name }}</button>
                          } @else if (item.previewKind) {
                            <button class="btn btn--link truncate name-btn" type="button" [title]="item.name" (click)="openPreview(item)">{{ item.name }}</button>
                          } @else {
                            <span class="truncate" [title]="item.name">{{ item.name }}</span>
                          }
                        </div>
                      </td>
                      <td class="num muted" data-label="Tamanho">{{ item.isFolder ? '—' : bytes(item.sizeBytes) }}</td>
                      @if (asSearchItem(item); as result) {
                        <td data-label="Local">
                          @if (result.parentId) {
                            <button class="btn btn--link btn--sm truncate" style="max-width: 240px" type="button" [title]="pathLabel(result)" (click)="openFolder(result.parentId)">
                              {{ pathLabel(result) }}
                            </button>
                          } @else {
                            <span class="muted">Itens compartilhados</span>
                          }
                        </td>
                      } @else {
                        <td class="col-date" data-label="Modificado em">{{ item.modifiedTime ? (item.modifiedTime | date: 'dd/MM/yyyy HH:mm') : '—' }}</td>
                      }
                      <td class="col-actions">
                        <div class="cell-actions">
                          @if (item.isFolder) {
                            <a class="btn btn--sm btn--ghost" [href]="folderZipUrl(item.id)" rel="nofollow" [attr.aria-label]="'Baixar ' + item.name + ' em ZIP'"><sid3-icon name="archive" />ZIP</a>
                          } @else {
                            @if (item.previewKind) {
                              <button class="btn btn--sm btn--ghost" type="button" (click)="openPreview(item)">
                                <sid3-icon [name]="item.previewKind === 'image' ? 'eye' : 'play'" />{{ item.previewKind === 'image' ? 'Ver' : 'Reproduzir' }}
                              </button>
                            }
                            @if (item.downloadable) {
                              <a class="btn btn--sm" [href]="downloadUrl(item)" [title]="item.exportExtension ? 'Baixa como .' + item.exportExtension : 'Baixar'" rel="nofollow">
                                <sid3-icon name="download" />Baixar
                              </a>
                            } @else {
                              <span class="muted text-sm">Indisponível</span>
                            }
                          }
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            @if (totalPages() > 1) {
              <div class="table-footer">
                <span></span>
                <nav class="cluster" aria-label="Paginação">
                  <button class="btn btn--sm btn--ghost" type="button" [disabled]="page() <= 1" (click)="goToPage(page() - 1)"><sid3-icon name="chev-left" />Anterior</button>
                  <span class="tabular text-sm">Página {{ page() }} de {{ totalPages() }}</span>
                  <button class="btn btn--sm btn--ghost" type="button" [disabled]="page() >= totalPages()" (click)="goToPage(page() + 1)">Próxima<sid3-icon name="chev" /></button>
                </nav>
              </div>
            }
          }
        </section>
      }

      <footer class="public__footer">Compartilhado via SID3</footer>
    </main>

    @if (previewStartId(); as startId) {
      <sid3-public-media-viewer
        [items]="previewableItems()"
        [startId]="startId"
        [contentUrl]="contentUrlFn"
        [downloadUrl]="downloadUrlFn"
        [loadDurationMs]="loadDurationMsFn"
        (closed)="previewStartId.set(null)"
      />
    }
  `,
  styles: [
    `
      .file-name { align-items: center; display: flex; gap: var(--space-2); min-width: 0; }
      .file-icon { color: var(--color-muted); }
      .file-icon.is-folder { color: var(--color-accent-text); }
      .name-btn { color: var(--color-ink); font-weight: var(--weight-regular); justify-content: flex-start; min-width: 0; }
      .name-btn:hover { color: var(--color-accent-text); }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PublicSharePageComponent implements OnInit {
  private readonly shareLinksService = inject(ShareLinksService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);

  /** Token secreto do link, vindo da rota /s/:token. */
  private readonly token = signal(this.route.snapshot.paramMap.get('token') ?? '');

  protected readonly share = signal<PublicShare | null>(null);
  protected readonly folder = signal<PublicFolderList | null>(null);
  protected readonly search = signal<PublicSearchResult | null>(null);
  protected readonly page = signal(1);
  protected readonly isLoading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly searchHint = signal<string | null>(null);
  protected readonly fatalError = signal<{ title: string; message: string } | null>(null);
  protected readonly previewStartId = signal<string | null>(null);

  protected readonly searchControl = new FormControl('', { nonNullable: true });

  /** Itens da navegação por pastas (sem busca). */
  protected readonly items = computed<PublicShareItem[]>(() => this.folder()?.items ?? this.share()?.items ?? []);
  protected readonly visibleItems = computed<PublicShareItem[]>(() => this.search()?.items ?? this.items());
  /** O visualizador percorre as mídias da lista que está na tela. */
  protected readonly previewableItems = computed(() => this.visibleItems().filter((item) => item.previewKind !== null));
  protected readonly totalPages = computed(() => {
    const listing = this.search() ?? this.folder();
    return listing ? Math.max(1, Math.ceil(listing.total / listing.pageSize)) : 1;
  });
  protected readonly emptyMessage = computed(() => {
    if (this.search()) return 'Nenhum item encontrado com esse nome.';
    return this.folder() ? 'Esta pasta está vazia.' : 'Nenhum item disponível neste link.';
  });

  protected readonly contentUrlFn = (item: PublicShareItem): string =>
    this.shareLinksService.publicContentUrl(this.token(), item.id);
  protected readonly downloadUrlFn = (item: PublicShareItem): string => this.downloadUrl(item);
  protected readonly loadDurationMsFn = async (item: PublicShareItem): Promise<number | null> =>
    (await firstValueFrom(this.shareLinksService.getPublicMediaInfo(this.token(), item.id))).durationMs;

  private folderSubscription: Subscription | null = null;
  private searchSubscription: Subscription | null = null;

  ngOnInit(): void {
    this.shareLinksService
      .getPublicShare(this.token())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (share) => {
          this.share.set(share);
          this.isLoading.set(false);
        },
        error: (error: unknown) => {
          this.isLoading.set(false);
          this.fatalError.set(this.describeLinkError(error));
        }
      });

    this.searchControl.valueChanges
      .pipe(
        map((value) => value.trim()),
        debounceTime(300),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((query) => this.runSearch(query, 1));

    this.destroyRef.onDestroy(() => {
      this.folderSubscription?.unsubscribe();
      this.searchSubscription?.unsubscribe();
    });
  }

  protected bytes(value: number | null): string {
    return formatBytes(value);
  }

  protected icon(item: PublicShareItem): string {
    if (item.isSharedDrive) return 'server';
    if (item.isFolder) return 'folder';
    return (item.previewKind && PREVIEW_ICONS[item.previewKind]) ?? 'file';
  }

  protected asSearchItem(item: PublicShareItem): PublicSearchItem | null {
    return this.search() ? (item as PublicSearchItem) : null;
  }

  protected pathLabel(item: PublicSearchItem): string {
    return item.path.join(' / ');
  }

  protected downloadUrl(item: PublicShareItem): string {
    return this.shareLinksService.publicDownloadUrl(this.token(), item.id);
  }

  protected folderZipUrl(folderId: string): string {
    return this.shareLinksService.publicFolderZipUrl(this.token(), folderId);
  }

  protected shareZipUrl(): string {
    return this.shareLinksService.publicShareZipUrl(this.token());
  }

  protected openPreview(item: PublicShareItem): void {
    this.previewStartId.set(item.id);
  }

  protected openRoot(): void {
    this.folderSubscription?.unsubscribe();
    this.folder.set(null);
    this.page.set(1);
    this.errorMessage.set(null);
  }

  /** Abrir uma pasta (também a partir de um resultado de busca) sai do modo de busca. */
  protected openFolder(folderId: string): void {
    this.leaveSearch();
    this.page.set(1);
    this.loadFolder(folderId);
  }

  protected clearSearch(): void {
    this.leaveSearch();
  }

  protected goToPage(page: number): void {
    const search = this.search();
    if (search) {
      this.runSearch(search.query, page);
      return;
    }
    const folder = this.folder();
    if (!folder) return;
    this.page.set(page);
    this.loadFolder(folder.folder.id);
  }

  private leaveSearch(): void {
    this.searchSubscription?.unsubscribe();
    this.search.set(null);
    this.searchHint.set(null);
    this.searchControl.setValue('', { emitEvent: false });
    this.page.set(this.folder()?.page ?? 1);
  }

  private runSearch(query: string, page: number): void {
    this.searchSubscription?.unsubscribe();
    this.errorMessage.set(null);

    if (query.length === 0) {
      this.leaveSearch();
      return;
    }
    if (query.length < MIN_SEARCH_LENGTH) {
      this.searchHint.set(`Digite pelo menos ${MIN_SEARCH_LENGTH} letras para buscar.`);
      return;
    }

    this.searchHint.set(null);
    this.isLoading.set(true);
    this.searchSubscription = this.shareLinksService.searchPublicShare(this.token(), query, page).subscribe({
      next: (result) => {
        this.search.set(result);
        this.page.set(result.page);
        this.isLoading.set(false);
      },
      error: (error: unknown) => this.handleListingError(error)
    });
  }

  private loadFolder(folderId: string): void {
    this.folderSubscription?.unsubscribe();
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.folderSubscription = this.shareLinksService.listPublicFolder(this.token(), folderId, this.page()).subscribe({
      next: (folder) => {
        this.folder.set(folder);
        this.isLoading.set(false);
      },
      error: (error: unknown) => this.handleListingError(error)
    });
  }

  private handleListingError(error: unknown): void {
    this.isLoading.set(false);
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    if (status === 410 || status === 503) {
      this.fatalError.set(this.describeLinkError(error));
    } else {
      this.errorMessage.set(toApiErrorMessage(error));
    }
  }

  private describeLinkError(error: unknown): { title: string; message: string } {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    if (status === 404) return { title: 'Link não encontrado', message: 'Confira se o endereço foi copiado inteiro.' };
    if (status === 410) return { title: 'Link indisponível', message: toApiErrorMessage(error) };
    if (status === 503) {
      const apiMessage = error instanceof HttpErrorResponse ? (error.error as { message?: unknown } | null)?.message : null;
      return {
        title: 'Arquivos indisponíveis no momento',
        message: typeof apiMessage === 'string' && apiMessage ? apiMessage : 'Quem compartilhou precisa reconectar a conta do Google Drive.'
      };
    }
    return { title: 'Não foi possível abrir o link', message: toApiErrorMessage(error) };
  }
}
