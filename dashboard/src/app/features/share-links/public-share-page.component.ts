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
import { PublicFolderList, PublicSearchItem, PublicSearchResult, PublicShare, PublicShareItem } from './share-link.models';
import { ShareLinksService } from './share-links.service';

const MIN_SEARCH_LENGTH = 2;
const PREVIEW_ICONS: Record<string, string> = { image: '🖼️', video: '🎬', audio: '🎵' };

/**
 * Página aberta por qualquer pessoa com o link (fora do login e do layout do dashboard).
 * A API valida em toda chamada que a pasta/arquivo pertence ao link.
 */
@Component({
  selector: 'sid3-public-share-page',
  imports: [DatePipe, ReactiveFormsModule, PublicMediaViewerComponent],
  template: `
    <main class="public-share">
      <header class="public-share-header">
        <span class="brand-mark">S3</span>
        <div>
          <h1>{{ share()?.name ?? 'Arquivos compartilhados' }}</h1>
          @if (share(); as current) {
            <p class="muted">
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
        <p class="muted">Carregando...</p>
      } @else if (fatalError()) {
        <section class="panel empty-cta" role="alert">
          <h2>{{ fatalError()!.title }}</h2>
          <p class="muted">{{ fatalError()!.message }}</p>
        </section>
      } @else if (share()) {
        <section class="panel">
          <div class="public-share-toolbar">
            @if (search(); as result) {
              <p class="public-search-summary" aria-live="polite">
                {{ result.total }} {{ result.total === 1 ? 'resultado' : 'resultados' }} para “{{ result.query }}”
                <button class="link-button" type="button" (click)="clearSearch()">Limpar busca</button>
              </p>
            } @else {
              <nav class="drive-breadcrumb" aria-label="Caminho">
                <button class="link-button" type="button" [class.current]="!folder()" (click)="openRoot()">Itens compartilhados</button>
                @for (crumb of folder()?.breadcrumb ?? []; track crumb.id) {
                  <span aria-hidden="true">/</span>
                  <button class="link-button" type="button" [class.current]="$last" (click)="openFolder(crumb.id)">
                    {{ crumb.name }}
                  </button>
                }
              </nav>
            }
            <div class="public-share-toolbar-actions">
              <label class="inline-filter drive-search">
                <span class="sr-only">Buscar nas pastas e arquivos do link</span>
                <input type="search" [formControl]="searchControl" placeholder="Buscar pastas e arquivos..." />
              </label>
              @if (!search()) {
                @if (folder(); as current) {
                  <a class="button-link compact-button" [href]="folderZipUrl(current.folder.id)" rel="nofollow">Baixar esta pasta (ZIP)</a>
                } @else if (items().length > 0) {
                  <a class="button-link compact-button" [href]="shareZipUrl()" rel="nofollow">Baixar tudo (ZIP)</a>
                }
              }
            </div>
          </div>

          @if (searchHint()) {
            <p class="field-hint">{{ searchHint() }}</p>
          }
          @if (errorMessage()) {
            <p class="form-error">{{ errorMessage() }}</p>
          }

          @if (visibleItems().length === 0) {
            <p class="empty-state">{{ emptyMessage() }}</p>
          } @else {
            <div class="table public-share-table" role="table" aria-label="Itens compartilhados" [attr.aria-busy]="isLoading()">
              <div role="row" class="head">
                <span role="columnheader">Nome</span>
                <span role="columnheader">Tamanho</span>
                <span role="columnheader">{{ search() ? 'Local' : 'Modificado em' }}</span>
                <span role="columnheader">Ação</span>
              </div>
              @for (item of visibleItems(); track item.id) {
                <div role="row">
                  <span role="cell" class="drive-name-cell">
                    @if (item.isFolder) {
                      <button class="link-button" type="button" (click)="openFolder(item.id)">
                        {{ item.isSharedDrive ? '🗄️' : '📁' }} {{ item.name }}
                      </button>
                    } @else if (item.previewKind) {
                      <button class="link-button" type="button" [title]="item.name" (click)="openPreview(item)">
                        {{ icon(item) }} {{ item.name }}
                      </button>
                    } @else {
                      <span [title]="item.name">📄 {{ item.name }}</span>
                    }
                  </span>
                  <span role="cell">{{ item.isFolder ? '—' : bytes(item.sizeBytes) }}</span>
                  @if (asSearchItem(item); as result) {
                    <span role="cell" class="public-search-path">
                      @if (result.parentId) {
                        <button class="link-button" type="button" [title]="pathLabel(result)" (click)="openFolder(result.parentId)">
                          {{ pathLabel(result) }}
                        </button>
                      } @else {
                        <span class="muted">Itens compartilhados</span>
                      }
                    </span>
                  } @else {
                    <span role="cell">{{ item.modifiedTime ? (item.modifiedTime | date: 'dd/MM/yyyy HH:mm') : '—' }}</span>
                  }
                  <span role="cell" class="action-cell">
                    @if (item.isFolder) {
                      <button class="secondary compact-button" type="button" (click)="openFolder(item.id)">Abrir</button>
                      <a class="button-link compact-button" [href]="folderZipUrl(item.id)" rel="nofollow" title="Baixar a pasta inteira em ZIP">ZIP</a>
                    } @else {
                      @if (item.previewKind) {
                        <button class="secondary compact-button" type="button" (click)="openPreview(item)">
                          {{ item.previewKind === 'image' ? 'Ver' : 'Reproduzir' }}
                        </button>
                      }
                      @if (item.downloadable) {
                        <a
                          class="button-link compact-button"
                          [href]="downloadUrl(item)"
                          [title]="item.exportExtension ? 'Baixa como .' + item.exportExtension : 'Baixar'"
                          rel="nofollow"
                        >
                          Baixar
                        </a>
                      } @else {
                        <span class="muted">Indisponível</span>
                      }
                    }
                  </span>
                </div>
              }
            </div>

            @if (totalPages() > 1) {
              <nav class="drive-pagination" aria-label="Paginação">
                <button class="secondary compact-button" type="button" [disabled]="page() <= 1" (click)="goToPage(page() - 1)">
                  Anterior
                </button>
                <span class="muted">Página {{ page() }} de {{ totalPages() }}</span>
                <button class="secondary compact-button" type="button" [disabled]="page() >= totalPages()" (click)="goToPage(page() + 1)">
                  Próxima
                </button>
              </nav>
            }
          }
        </section>
      }

      <footer class="public-share-footer muted">Compartilhado via SID3</footer>
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
    return (item.previewKind && PREVIEW_ICONS[item.previewKind]) ?? '📄';
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
    if (status === 503) return { title: 'Arquivos indisponíveis', message: toApiErrorMessage(error) };
    return { title: 'Não foi possível abrir o link', message: toApiErrorMessage(error) };
  }
}
