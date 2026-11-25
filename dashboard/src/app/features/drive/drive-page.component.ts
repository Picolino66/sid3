import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, finalize, Subscription, switchMap, timer } from 'rxjs';
import { toApiErrorMessage } from '../../core/api/api-error';
import { NotificationService } from '../../core/notifications/notification.service';
import { Connection } from '../connections/connection.models';
import { ConnectionsService } from '../connections/connections.service';
import {
  downloadFileName,
  drivePreviewKind,
  DrivePreviewKind,
  driveTypeLabel,
  formatBytes,
  saveBlob,
  toBlobApiErrorMessage
} from './drive-file.presenter';
import { CreateShareLinkDialogComponent, ShareableItem } from '../share-links/create-share-link-dialog.component';
import { DriveFilesService } from './drive-files.service';
import {
  DRIVE_ROOT,
  DRIVE_SHARED,
  DRIVE_SHARED_DRIVES,
  DriveFile,
  DriveFileList,
  DriveFileListSection,
  DriveIndexRefreshMode,
  DriveIndexStatus
} from './drive.models';

const PAGE_SIZE = 50;
const MAX_SHARE_ITEMS = 500;

const DRIVE_SECTIONS: ReadonlyArray<{ id: string; section: DriveFileListSection; label: string }> = [
  { id: DRIVE_ROOT, section: 'my-drive', label: 'Meu Drive' },
  { id: DRIVE_SHARED_DRIVES, section: 'shared-drives', label: 'Drives compartilhados' },
  { id: DRIVE_SHARED, section: 'shared-with-me', label: 'Compartilhados comigo' }
];
const STATUS_POLL_INTERVAL_MS = 2000;

type DrivePreview = {
  file: DriveFile;
  kind: DrivePreviewKind;
  loading: boolean;
  objectUrl: string | null;
  safeUrl: SafeResourceUrl | null;
  text: string | null;
};

@Component({
  selector: 'sid3-drive-page',
  imports: [CreateShareLinkDialogComponent, DatePipe, ReactiveFormsModule, RouterLink],
  template: `
    <header class="topbar">
      <div>
        <h1>Meu Drive</h1>
        <p class="muted">Arquivos indexados das suas contas Google Drive.</p>
      </div>
      @if (connections().length > 1) {
        <label class="topbar-select">
          Conta
          <select [value]="selectedConnectionId()" (change)="selectConnection($any($event.target).value)">
            @for (connection of connections(); track connection.id) {
              <option [value]="connection.id">{{ connectionLabel(connection) }}</option>
            }
          </select>
        </label>
      }
    </header>

    @if (isLoadingConnections()) {
      <p class="muted">Carregando conexões...</p>
    } @else if (connections().length === 0) {
      <section class="panel empty-cta">
        <p class="muted">Nenhuma conta Google Drive ativa.</p>
        <a class="button-link" routerLink="/connections">Conectar Google Drive</a>
      </section>
    } @else {
      @if (status(); as indexStatus) {
        @if (!indexStatus.hasReadScope) {
          <div class="banner-warning drive-banner" role="alert">
            <span>
              Esta conexão só tem acesso aos arquivos enviados pelo SID3. Para indexar e baixar todo o Drive,
              reconecte a conta e autorize a leitura.
            </span>
            <button class="compact-button" type="button" [disabled]="isReauthorizing()" (click)="reauthorize()">
              {{ isReauthorizing() ? 'Redirecionando...' : 'Reconectar com leitura' }}
            </button>
          </div>
        }

        <section class="panel">
          <header class="panel-header-row drive-index-bar">
            <div class="drive-index-summary" aria-live="polite">
              @switch (indexStatus.status) {
                @case ('INDEXING') {
                  <span class="status-label error">Indexando...</span>
                  <span class="muted">
                    {{ indexStatus.lastIndexedAt ? 'Aplicando mudanças do Drive.' : 'Primeira varredura; pode levar alguns minutos.' }}
                  </span>
                }
                @case ('READY') {
                  <span class="status-label connected">Indexado</span>
                  <span class="muted">
                    {{ indexStatus.itemCount }} itens · atualizado em {{ indexStatus.lastIndexedAt | date: 'dd/MM/yyyy HH:mm' }}
                  </span>
                }
                @case ('FAILED') {
                  <span class="status-label revoked">Falha na indexação</span>
                  <span class="muted">{{ indexStatus.lastError }}</span>
                }
                @default {
                  <span class="status-label">Ainda não indexado</span>
                }
              }
            </div>
            <div class="action-cell">
              <button
                type="button"
                [disabled]="!indexStatus.hasReadScope || indexStatus.status === 'INDEXING' || isRequestingRefresh()"
                (click)="refresh('incremental')"
              >
                {{ indexStatus.status === 'INDEXING' ? 'Atualizando...' : 'Atualizar' }}
              </button>
              <button
                class="secondary"
                type="button"
                title="Refaz a varredura completa do Drive"
                [disabled]="!indexStatus.hasReadScope || indexStatus.status === 'INDEXING' || isRequestingRefresh()"
                (click)="refresh('full')"
              >
                Reindexar tudo
              </button>
            </div>
          </header>

          <div class="drive-toolbar">
            <div class="drive-locations">
              <nav class="drive-sections" aria-label="Seções do Drive">
                @for (location of sections; track location.id) {
                  <button
                    class="link-button"
                    type="button"
                    [class.current]="!search() && currentSection() === location.section"
                    [attr.aria-current]="!search() && currentSection() === location.section ? 'page' : null"
                    (click)="openLocation(location.id)"
                  >
                    {{ location.label }}
                  </button>
                }
              </nav>
              <nav class="drive-breadcrumb" aria-label="Caminho da pasta">
                @if (search()) {
                  <span>Resultados para "{{ search() }}"</span>
                } @else if ((listing()?.breadcrumb ?? []).length > 0) {
                  <button class="link-button" type="button" (click)="openLocation(sectionRootId())">{{ sectionLabel() }}</button>
                  @for (crumb of listing()!.breadcrumb; track crumb.id) {
                    <span aria-hidden="true">/</span>
                    <button class="link-button" type="button" [class.current]="$last" (click)="openLocation(crumb.id)">
                      {{ crumb.name }}
                    </button>
                  }
                }
              </nav>
            </div>
            <label class="inline-filter drive-search">
              <span class="sr-only">Buscar por nome</span>
              <input type="search" [formControl]="searchControl" placeholder="Buscar em todo o Drive..." />
            </label>
          </div>

          @if (errorMessage()) {
            <p class="form-error">{{ errorMessage() }}</p>
          }

          @if (selectedCount() > 0) {
            <div class="selection-bar" role="region" aria-label="Itens selecionados">
              <span>
                <strong>{{ selectedCount() }}</strong> {{ selectedCount() === 1 ? 'item selecionado' : 'itens selecionados' }}
                <span class="muted">(a seleção é mantida ao trocar de pasta)</span>
              </span>
              <div class="action-cell">
                <button class="secondary compact-button" type="button" (click)="clearSelection()">Limpar</button>
                <button class="compact-button" type="button" [disabled]="selectedCount() > maxShareItems" (click)="isShareDialogOpen.set(true)">
                  Gerar link público
                </button>
              </div>
            </div>
          }

          @if (isLoadingFiles() && !listing()) {
            <p class="muted">Carregando arquivos...</p>
          } @else if ((listing()?.items ?? []).length === 0) {
            <p class="empty-state">
              @if (indexStatus.status === 'NEVER_INDEXED') {
                O Drive ainda não foi indexado. Clique em "Atualizar" para fazer a primeira varredura.
              } @else if (indexStatus.status === 'INDEXING' && !indexStatus.lastIndexedAt) {
                Indexando seu Drive... os arquivos aparecem aqui ao terminar.
              } @else if (search()) {
                Nenhum arquivo encontrado.
              } @else if (parentId() === sharedDrives) {
                Esta conta não participa de nenhum drive compartilhado.
              } @else {
                Esta pasta está vazia.
              }
            </p>
          } @else {
            <div class="table drive-table" role="table" aria-label="Arquivos do Drive" [attr.aria-busy]="isLoadingFiles()">
              <div role="row" class="head">
                <span role="columnheader" class="select-cell">
                  <input
                    type="checkbox"
                    aria-label="Selecionar todos desta página"
                    [checked]="isPageFullySelected()"
                    [indeterminate]="isPagePartiallySelected()"
                    (change)="togglePageSelection($any($event.target).checked)"
                  />
                </span>
                <span role="columnheader">Nome</span>
                <span role="columnheader">Tipo</span>
                <span role="columnheader">Tamanho</span>
                <span role="columnheader">Modificado em</span>
                <span role="columnheader">Ações</span>
              </div>
              @for (file of listing()!.items; track file.id) {
                <div role="row" [class.selected]="isSelected(file)">
                  <span role="cell" class="select-cell">
                    <input
                      type="checkbox"
                      [attr.aria-label]="'Selecionar ' + file.name"
                      [checked]="isSelected(file)"
                      (change)="toggleSelection(file, $any($event.target).checked)"
                    />
                  </span>
                  <span role="cell" class="drive-name-cell">
                    @if (file.isFolder) {
                      <button class="link-button" type="button" (click)="openLocation(file.id)">
                        {{ file.isSharedDrive ? '🗄️' : '📁' }} {{ file.name }}
                      </button>
                    } @else {
                      <span [title]="file.name">{{ file.name }}</span>
                    }
                  </span>
                  <span role="cell">{{ file.isSharedDrive ? 'Drive compartilhado' : typeLabel(file) }}</span>
                  <span role="cell">{{ file.isFolder ? '—' : bytes(file.sizeBytes) }}</span>
                  <span role="cell">{{ file.modifiedTime ? (file.modifiedTime | date: 'dd/MM/yyyy HH:mm') : '—' }}</span>
                  <span role="cell" class="action-cell">
                    @if (file.isFolder) {
                      <button
                        class="compact-button secondary"
                        type="button"
                        [disabled]="downloadingId() === file.id"
                        title="Baixar a pasta inteira (com subpastas) em ZIP"
                        (click)="download(file)"
                      >
                        {{ downloadingId() === file.id ? 'Gerando ZIP...' : 'Baixar ZIP' }}
                      </button>
                    }
                    @if (previewKind(file)) {
                      <button class="compact-button secondary" type="button" (click)="openPreview(file)">Ver</button>
                    }
                    @if (file.downloadable) {
                      <button
                        class="compact-button"
                        type="button"
                        [disabled]="downloadingId() === file.id"
                        [title]="file.exportExtension ? 'Baixa como .' + file.exportExtension : 'Baixar arquivo'"
                        (click)="download(file)"
                      >
                        {{ downloadingId() === file.id ? 'Baixando...' : 'Baixar' }}
                      </button>
                    }
                    @if (file.webViewLink) {
                      <a class="compact-link" [href]="file.webViewLink" target="_blank" rel="noopener noreferrer">Abrir no Drive</a>
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
                <span class="muted">Página {{ page() }} de {{ totalPages() }} · {{ listing()!.total }} itens</span>
                <button
                  class="secondary compact-button"
                  type="button"
                  [disabled]="page() >= totalPages()"
                  (click)="goToPage(page() + 1)"
                >
                  Próxima
                </button>
              </nav>
            }
          }
        </section>
      }
    }

    @if (isShareDialogOpen() && selectedConnectionId()) {
      <sid3-create-share-link-dialog
        [connectionId]="selectedConnectionId()!"
        [items]="selectedItems()"
        (created)="clearSelection()"
        (closed)="isShareDialogOpen.set(false)"
      />
    }

    @if (preview(); as current) {
      <div class="modal-overlay" role="presentation" (click)="closePreview()">
        <div
          class="preview-modal-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="drive-preview-title"
          (click)="$event.stopPropagation()"
          (keydown.escape)="closePreview()"
        >
          <header>
            <h3 id="drive-preview-title">{{ current.file.name }}</h3>
            <p class="field-hint">{{ typeLabel(current.file) }} — {{ bytes(current.file.sizeBytes) }}</p>
          </header>
          <div class="preview-content">
            @if (current.loading) {
              <p class="muted">Carregando pré-visualização...</p>
            } @else if (current.kind === 'text') {
              <pre><code>{{ current.text }}</code></pre>
            } @else if (current.kind === 'image' && current.objectUrl) {
              <img [src]="current.safeUrl" [alt]="current.file.name" />
            } @else if (current.kind === 'pdf' && current.safeUrl) {
              <iframe [src]="current.safeUrl" [title]="current.file.name"></iframe>
            } @else if (current.kind === 'video' && current.safeUrl) {
              <video [src]="current.safeUrl" controls></video>
            } @else if (current.kind === 'audio' && current.safeUrl) {
              <audio [src]="current.safeUrl" controls></audio>
            }
          </div>
          <div class="modal-actions">
            <button class="secondary" type="button" (click)="closePreview()">Fechar</button>
            <button type="button" (click)="download(current.file)">Baixar</button>
          </div>
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DrivePageComponent {
  private readonly connectionsService = inject(ConnectionsService);
  private readonly driveFilesService = inject(DriveFilesService);
  private readonly notificationService = inject(NotificationService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly sections = DRIVE_SECTIONS;
  protected readonly sharedDrives = DRIVE_SHARED_DRIVES;

  protected readonly connections = signal<Connection[]>([]);
  protected readonly selectedConnectionId = signal<string | null>(null);
  protected readonly status = signal<DriveIndexStatus | null>(null);
  protected readonly listing = signal<DriveFileList | null>(null);
  protected readonly parentId = signal<string>(DRIVE_ROOT);
  protected readonly search = signal('');
  protected readonly page = signal(1);
  protected readonly preview = signal<DrivePreview | null>(null);

  protected readonly isLoadingConnections = signal(true);
  protected readonly isLoadingFiles = signal(false);
  protected readonly isRequestingRefresh = signal(false);
  protected readonly isReauthorizing = signal(false);
  protected readonly downloadingId = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  /** Seleção para compartilhamento; vale entre pastas/páginas da mesma conexão. */
  protected readonly selection = signal<ReadonlyMap<string, ShareableItem>>(new Map());
  protected readonly selectedItems = computed(() => [...this.selection().values()]);
  protected readonly selectedCount = computed(() => this.selection().size);
  protected readonly isShareDialogOpen = signal(false);
  protected readonly maxShareItems = MAX_SHARE_ITEMS;

  protected readonly isPageFullySelected = computed(() => {
    const items = this.listing()?.items ?? [];
    return items.length > 0 && items.every((file) => this.selection().has(file.id));
  });

  protected readonly isPagePartiallySelected = computed(() => {
    const items = this.listing()?.items ?? [];
    const selectedOnPage = items.filter((file) => this.selection().has(file.id)).length;
    return selectedOnPage > 0 && selectedOnPage < items.length;
  });

  protected readonly totalPages = computed(() => {
    const listing = this.listing();
    return listing ? Math.max(1, Math.ceil(listing.total / listing.pageSize)) : 1;
  });

  /** Seção da pasta aberta (vem da API, que sabe se a pasta está no Meu Drive ou num drive compartilhado). */
  protected readonly currentSection = computed<DriveFileListSection>(() => {
    const fromApi = this.listing()?.section;
    if (fromApi && fromApi !== 'search') return fromApi;
    return DRIVE_SECTIONS.find((location) => location.id === this.parentId())?.section ?? 'my-drive';
  });

  protected readonly sectionLabel = computed(
    () => DRIVE_SECTIONS.find((location) => location.section === this.currentSection())?.label ?? 'Meu Drive'
  );

  protected readonly sectionRootId = computed(
    () => DRIVE_SECTIONS.find((location) => location.section === this.currentSection())?.id ?? DRIVE_ROOT
  );

  protected readonly searchControl = new FormControl('', { nonNullable: true });

  private listSubscription: Subscription | null = null;
  private pollSubscription: Subscription | null = null;
  private previewSubscription: Subscription | null = null;

  constructor() {
    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.search.set(value.trim());
        this.page.set(1);
        this.loadFiles();
      });

    this.destroyRef.onDestroy(() => {
      this.listSubscription?.unsubscribe();
      this.pollSubscription?.unsubscribe();
      this.closePreview();
    });

    this.loadConnections();
  }

  protected connectionLabel(connection: Connection): string {
    return connection.displayName ?? connection.providerAccountEmail ?? 'Google Drive';
  }

  protected typeLabel(file: DriveFile): string {
    return driveTypeLabel(file);
  }

  protected bytes(value: number | null): string {
    return formatBytes(value);
  }

  protected previewKind(file: DriveFile): DrivePreviewKind | null {
    return drivePreviewKind(file);
  }

  protected isSelected(file: DriveFile): boolean {
    return this.selection().has(file.id);
  }

  protected toggleSelection(file: DriveFile, selected: boolean): void {
    this.updateSelection([file], selected);
  }

  protected togglePageSelection(selected: boolean): void {
    this.updateSelection(this.listing()?.items ?? [], selected);
  }

  protected clearSelection(): void {
    this.selection.set(new Map());
  }

  private updateSelection(files: DriveFile[], selected: boolean): void {
    const next = new Map(this.selection());
    for (const file of files) {
      if (selected) {
        next.set(file.id, { id: file.id, name: file.name, isFolder: file.isFolder });
      } else {
        next.delete(file.id);
      }
    }
    if (next.size > MAX_SHARE_ITEMS) {
      this.notificationService.warning(`Um link aceita até ${MAX_SHARE_ITEMS} itens. Compartilhe a pasta em vez dos arquivos.`);
    }
    this.selection.set(next);
  }

  protected selectConnection(connectionId: string): void {
    this.pollSubscription?.unsubscribe();
    this.closePreview();
    this.clearSelection();
    this.selectedConnectionId.set(connectionId);
    this.status.set(null);
    this.listing.set(null);
    this.parentId.set(DRIVE_ROOT);
    this.page.set(1);
    this.searchControl.setValue('', { emitEvent: false });
    this.search.set('');
    this.loadStatus();
    this.loadFiles();
  }

  protected openLocation(parentId: string): void {
    this.searchControl.setValue('', { emitEvent: false });
    this.search.set('');
    this.parentId.set(parentId);
    this.page.set(1);
    this.loadFiles();
  }

  protected goToPage(page: number): void {
    this.page.set(page);
    this.loadFiles();
  }

  protected refresh(mode: DriveIndexRefreshMode): void {
    const connectionId = this.selectedConnectionId();
    if (!connectionId) return;

    this.isRequestingRefresh.set(true);
    this.driveFilesService
      .refreshIndex(connectionId, mode)
      .pipe(finalize(() => this.isRequestingRefresh.set(false)))
      .subscribe({
        next: (status) => {
          this.status.set(status);
          this.pollWhileIndexing(connectionId);
        },
        error: (error: unknown) => this.notificationService.error(toApiErrorMessage(error))
      });
  }

  protected reauthorize(): void {
    const connectionId = this.selectedConnectionId();
    if (!connectionId) return;

    this.isReauthorizing.set(true);
    this.connectionsService
      .reauthorizeConnection(connectionId)
      .pipe(finalize(() => this.isReauthorizing.set(false)))
      .subscribe({
        next: (response) => window.location.assign(response.authorizationUrl),
        error: (error: unknown) => this.notificationService.error(toApiErrorMessage(error))
      });
  }

  protected download(file: DriveFile): void {
    const connectionId = this.selectedConnectionId();
    if (!connectionId) return;

    this.downloadingId.set(file.id);
    const request = file.isFolder
      ? this.driveFilesService.downloadFolderZip(connectionId, file.id)
      : this.driveFilesService.downloadFile(connectionId, file.id);
    request
      .pipe(finalize(() => this.downloadingId.set(null)))
      .subscribe({
        next: (response) => {
          if (response.body) {
            saveBlob(response.body, downloadFileName(response, file));
          }
        },
        error: (error: unknown) => void toBlobApiErrorMessage(error).then((msg) => this.notificationService.error(msg))
      });
  }

  protected openPreview(file: DriveFile): void {
    const connectionId = this.selectedConnectionId();
    const kind = drivePreviewKind(file);
    if (!connectionId || !kind) return;

    this.closePreview();
    this.preview.set({ file, kind, loading: true, objectUrl: null, safeUrl: null, text: null });

    this.previewSubscription = this.driveFilesService.downloadFile(connectionId, file.id).subscribe({
      next: (response) => {
        const blob = response.body;
        if (!blob) {
          this.closePreview();
          return;
        }
        if (kind === 'text') {
          void blob.text().then((text) => this.updatePreview(file.id, { loading: false, text }));
          return;
        }
        // URL "blob:" criada aqui mesmo a partir da resposta da API; segura para iframe/img/video.
        const objectUrl = URL.createObjectURL(blob);
        this.updatePreview(file.id, {
          loading: false,
          objectUrl,
          safeUrl: this.sanitizer.bypassSecurityTrustResourceUrl(objectUrl)
        });
      },
      error: (error: unknown) => {
        this.closePreview();
        void toBlobApiErrorMessage(error).then((msg) => this.notificationService.error(msg));
      }
    });
  }

  protected closePreview(): void {
    this.previewSubscription?.unsubscribe();
    this.previewSubscription = null;
    const objectUrl = this.preview()?.objectUrl;
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
    this.preview.set(null);
  }

  private updatePreview(fileId: string, changes: Partial<DrivePreview>): void {
    const current = this.preview();
    if (current?.file.id !== fileId) {
      if (changes.objectUrl) URL.revokeObjectURL(changes.objectUrl);
      return;
    }
    this.preview.set({ ...current, ...changes });
  }

  private loadConnections(): void {
    this.connectionsService
      .listConnections()
      .pipe(
        finalize(() => this.isLoadingConnections.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (connections) => {
          const active = connections.filter((connection) => connection.status === 'CONNECTED');
          this.connections.set(active);
          const first = active[0];
          if (first) {
            this.selectConnection(first.id);
          }
        },
        error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
      });
  }

  private loadStatus(): void {
    const connectionId = this.selectedConnectionId();
    if (!connectionId) return;

    this.driveFilesService
      .getIndexStatus(connectionId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (status) => {
          if (this.selectedConnectionId() !== connectionId) return;
          this.status.set(status);
          if (status.status === 'INDEXING') {
            this.pollWhileIndexing(connectionId);
          }
        },
        error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
      });
  }

  /** Consulta o status até a indexação terminar e então recarrega a pasta atual. */
  private pollWhileIndexing(connectionId: string): void {
    this.pollSubscription?.unsubscribe();
    this.pollSubscription = timer(STATUS_POLL_INTERVAL_MS, STATUS_POLL_INTERVAL_MS)
      .pipe(switchMap(() => this.driveFilesService.getIndexStatus(connectionId)))
      .subscribe({
        next: (status) => {
          if (this.selectedConnectionId() !== connectionId) {
            this.pollSubscription?.unsubscribe();
            return;
          }
          this.status.set(status);
          if (status.status === 'INDEXING') return;

          this.pollSubscription?.unsubscribe();
          if (status.status === 'READY') {
            this.notificationService.success(`Drive atualizado: ${status.itemCount} itens indexados.`);
            this.loadFiles();
          } else if (status.status === 'FAILED') {
            this.notificationService.error(`Falha ao indexar o Drive: ${status.lastError ?? 'erro desconhecido'}`);
          }
        },
        error: (error: unknown) => this.notificationService.error(toApiErrorMessage(error))
      });
  }

  private loadFiles(): void {
    const connectionId = this.selectedConnectionId();
    if (!connectionId) return;

    this.listSubscription?.unsubscribe();
    this.isLoadingFiles.set(true);
    this.errorMessage.set(null);

    this.listSubscription = this.driveFilesService
      .listFiles(connectionId, {
        parentId: this.search() ? undefined : this.parentId(),
        q: this.search() || undefined,
        page: this.page(),
        pageSize: PAGE_SIZE
      })
      .pipe(finalize(() => this.isLoadingFiles.set(false)))
      .subscribe({
        next: (listing) => this.listing.set(listing),
        error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
      });
  }
}
