import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, finalize, map, Subscription, switchMap, timer } from 'rxjs';
import { ProjectContextService } from '../../core/project-context/project-context.service';
import { ProjectConnection } from '../projects/project.models';
import { ProjectsService } from '../projects/projects.service';
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
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { ErrorStateComponent } from '../../shared/ui/error-state.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { MenuComponent } from '../../shared/ui/menu.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { NoProjectStateComponent } from '../../shared/ui/no-project-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { SkeletonComponent } from '../../shared/ui/skeleton.component';
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
  imports: [
    CreateShareLinkDialogComponent,
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    EmptyStateComponent,
    ErrorStateComponent,
    IconComponent,
    MenuComponent,
    ModalComponent,
    NoProjectStateComponent,
    PageHeaderComponent,
    SkeletonComponent
  ],
  template: `
    <sid3-page-header title="Meu Drive" description="Todo o conteúdo das contas do Google Drive deste projeto, para navegar, baixar e compartilhar.">
      @if (connections().length > 1) {
        <label class="cluster" style="gap: var(--space-2)">
          <span class="muted text-sm">Conta</span>
          <select class="select select--sm" style="width: auto; max-width: 240px" [value]="selectedConnectionId()" (change)="selectConnection($any($event.target).value)">
            @for (connection of connections(); track connection.id) {
              <option [value]="connection.id" [selected]="connection.id === selectedConnectionId()">{{ connectionLabel(connection) }}</option>
            }
          </select>
        </label>
      }
      @if (status(); as indexStatus) {
        <div class="cluster" style="gap: 0">
          <button
            class="btn btn--sm"
            style="border-top-right-radius: 0; border-bottom-right-radius: 0"
            type="button"
            [disabled]="!indexStatus.hasReadScope || indexStatus.status === 'INDEXING' || isRequestingRefresh()"
            (click)="refresh('incremental')"
          >
            <sid3-icon name="refresh" [spin]="indexStatus.status === 'INDEXING'" />{{ indexStatus.status === 'INDEXING' ? 'Atualizando...' : 'Atualizar' }}
          </button>
          <sid3-menu label="Mais opções de atualização" icon="chev-down" triggerClass="btn btn--sm btn--icon split-btn" [disabled]="!indexStatus.hasReadScope || indexStatus.status === 'INDEXING' || isRequestingRefresh()">
            <button class="menu-item" type="button" role="menuitem" (click)="refresh('full')"><sid3-icon name="rotate" />Reindexar tudo</button>
          </sid3-menu>
        </div>
      }
    </sid3-page-header>

    @if (projectContext.loaded() && !projectContext.currentProjectId()) {
      <sid3-no-project-state />
    } @else if (isLoadingConnections()) {
      <section class="card"><sid3-skeleton [count]="6" label="Carregando contas" /></section>
    } @else if (connections().length === 0) {
      <section class="card">
        @if (errorMessage()) {
          <sid3-error-state title="Não foi possível carregar as contas" [message]="errorMessage()!" (retry)="reloadConnections()" />
        } @else {
          <sid3-empty-state icon="drive" title="Nenhuma conta do Google Drive ativa neste projeto" description="Adicione uma conta ao projeto para navegar pelo Drive dela.">
            <a class="btn btn--primary" routerLink="/storage">Adicionar conta ao projeto</a>
          </sid3-empty-state>
        }
      </section>
    } @else if (status(); as indexStatus) {
      @if (!indexStatus.hasReadScope) {
        <div class="callout callout--warn" role="alert">
          <sid3-icon name="alert" />
          <span class="callout__text">Esta conexão só acessa os arquivos enviados pelo SID3. Para indexar e baixar todo o Drive, reconecte e autorize a leitura.</span>
          <button class="btn btn--sm" type="button" [disabled]="isReauthorizing()" (click)="reauthorize()">
            <sid3-icon [name]="isReauthorizing() ? 'loader' : 'refresh'" [spin]="isReauthorizing()" />
            {{ isReauthorizing() ? 'Redirecionando...' : 'Reconectar com leitura' }}
          </button>
        </div>
      }

      <section class="card">
        <div class="toolbar drive-head">
          <div class="segmented" role="group" aria-label="Seções do Drive">
            @for (location of sections; track location.id) {
              <button type="button" [attr.aria-pressed]="!search() && currentSection() === location.section" (click)="openLocation(location.id)">
                {{ location.label }}
              </button>
            }
          </div>
          <div class="drive-index" aria-live="polite">
            @switch (indexStatus.status) {
              @case ('INDEXING') {
                <span class="chip chip--info chip--pulse">Indexando</span>
                <span class="muted text-xs">{{ indexStatus.lastIndexedAt ? 'Aplicando mudanças do Drive' : 'Primeira varredura, pode levar alguns minutos' }}</span>
              }
              @case ('READY') {
                <span class="chip chip--success">Indexado</span>
                <span class="muted text-xs">{{ indexStatus.itemCount }} itens · {{ indexStatus.lastIndexedAt | date: 'dd/MM HH:mm' }}</span>
              }
              @case ('FAILED') {
                <span class="chip chip--danger">Falha na indexação</span>
                <span class="muted text-xs truncate" [title]="indexStatus.lastError ?? ''">{{ indexStatus.lastError }}</span>
              }
              @default {
                <span class="chip chip--neutral">Não indexado</span>
              }
            }
          </div>
        </div>

        <div class="toolbar" style="padding-top: 0">
          <nav class="crumbs" aria-label="Caminho da pasta">
            @if (search()) {
              <span class="crumbs__item" aria-current="page">Resultados para "{{ search() }}"</span>
            } @else {
              <button class="crumbs__item" type="button" [attr.aria-current]="(listing()?.breadcrumb ?? []).length === 0 ? 'page' : null" (click)="openLocation(sectionRootId())">
                {{ sectionLabel() }}
              </button>
              @for (crumb of listing()?.breadcrumb ?? []; track crumb.id; let last = $last) {
                <sid3-icon class="crumbs__sep" name="chev" size="sm" />
                <button class="crumbs__item" type="button" [attr.aria-current]="last ? 'page' : null" (click)="openLocation(crumb.id)">{{ crumb.name }}</button>
              }
            }
          </nav>
          <label class="input-icon toolbar__search">
            <span class="sr-only">Buscar em todo o Drive</span>
            <sid3-icon name="search" />
            <input class="input input--sm" type="search" [formControl]="searchControl" placeholder="Buscar em todo o Drive" />
          </label>
        </div>

        @if (selectedCount() > 0) {
          <div class="bulk-bar" role="region" aria-label="Itens selecionados">
            <span class="text-sm">
              <strong>{{ selectedCount() }}</strong> {{ selectedCount() === 1 ? 'item selecionado' : 'itens selecionados' }}
              <span class="muted">· a seleção continua ao trocar de pasta</span>
            </span>
            <div class="cluster">
              <button class="btn btn--sm btn--ghost" type="button" (click)="clearSelection()">Limpar</button>
              <button class="btn btn--sm btn--primary" type="button" [disabled]="selectedCount() > maxShareItems" (click)="isShareDialogOpen.set(true)">
                <sid3-icon name="link" />Gerar link público
              </button>
            </div>
          </div>
        }

        @if (isLoadingFiles() && !listing()) {
          <sid3-skeleton [count]="8" label="Carregando arquivos" />
        } @else if (errorMessage()) {
          <sid3-error-state title="Não foi possível listar os arquivos" [message]="errorMessage()!" [compact]="true" (retry)="goToPage(page())" />
        } @else if ((listing()?.items ?? []).length === 0) {
          @if (indexStatus.status === 'NEVER_INDEXED') {
            <sid3-empty-state icon="drive" title="O Drive ainda não foi indexado" description="Faça a primeira varredura para ver e buscar os arquivos aqui." [compact]="true">
              <button class="btn btn--primary btn--sm" type="button" [disabled]="!indexStatus.hasReadScope || isRequestingRefresh()" (click)="refresh('incremental')">Indexar agora</button>
            </sid3-empty-state>
          } @else if (indexStatus.status === 'INDEXING' && !indexStatus.lastIndexedAt) {
            <sid3-empty-state icon="loader" title="Indexando seu Drive" description="Os arquivos aparecem aqui assim que a varredura terminar." [compact]="true" />
          } @else if (search()) {
            <sid3-empty-state icon="search" title="Nenhum arquivo encontrado" description="Tente outro nome ou parte do nome." [compact]="true" />
          } @else if (parentId() === sharedDrives) {
            <sid3-empty-state icon="server" title="Nenhum drive compartilhado" description="Esta conta não participa de drives compartilhados." [compact]="true" />
          } @else {
            <sid3-empty-state icon="folder" title="Esta pasta está vazia" [compact]="true" />
          }
        } @else {
          <div class="table-wrap" [attr.aria-busy]="isLoadingFiles()" [style.opacity]="isLoadingFiles() ? 0.6 : 1">
            <table class="table table--responsive">
              <thead>
                <tr>
                  <th class="col-check">
                    <input
                      class="checkbox"
                      type="checkbox"
                      aria-label="Selecionar todos desta página"
                      [checked]="isPageFullySelected()"
                      [indeterminate]="isPagePartiallySelected()"
                      (change)="togglePageSelection($any($event.target).checked)"
                    />
                  </th>
                  <th>Nome</th>
                  <th>Tipo</th>
                  <th class="num">Tamanho</th>
                  <th>Modificado em</th>
                  <th class="col-actions"><span class="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                @for (file of listing()!.items; track file.id) {
                  <tr [attr.aria-selected]="isSelected(file)">
                    <td class="col-check">
                      <input class="checkbox" type="checkbox" [attr.aria-label]="'Selecionar ' + file.name" [checked]="isSelected(file)" (change)="toggleSelection(file, $any($event.target).checked)" />
                    </td>
                    <td class="cell-primary">
                      <div class="file-name">
                        <sid3-icon [class]="'file-icon' + (file.isFolder ? ' is-folder' : '')" [name]="fileIcon(file)" />
                        @if (file.isFolder) {
                          <button class="btn btn--link truncate" type="button" style="color: var(--color-ink); font-weight: var(--weight-medium)" (click)="openLocation(file.id)">{{ file.name }}</button>
                        } @else if (previewKind(file)) {
                          <button class="btn btn--link truncate" type="button" style="color: var(--color-ink); font-weight: var(--weight-regular)" [title]="file.name" (click)="openPreview(file)">{{ file.name }}</button>
                        } @else {
                          <span class="truncate" [title]="file.name">{{ file.name }}</span>
                        }
                      </div>
                    </td>
                    <td data-label="Tipo" class="muted">{{ file.isSharedDrive ? 'Drive compartilhado' : typeLabel(file) }}</td>
                    <td data-label="Tamanho" class="num muted">{{ file.isFolder ? '—' : bytes(file.sizeBytes) }}</td>
                    <td data-label="Modificado em" class="col-date">{{ file.modifiedTime ? (file.modifiedTime | date: 'dd/MM/yyyy HH:mm') : '—' }}</td>
                    <td class="col-actions">
                      <div class="cell-actions">
                        @if (downloadingId() === file.id) {
                          <span class="chip chip--info chip--pulse">{{ file.isFolder ? 'Gerando ZIP' : 'Baixando' }}</span>
                        } @else if (file.isFolder) {
                          <button class="btn btn--ghost btn--sm btn--icon" type="button" data-tooltip="Baixar pasta (ZIP)" data-tooltip-pos="left" [attr.aria-label]="'Baixar ' + file.name + ' em ZIP'" (click)="download(file)">
                            <sid3-icon name="archive" />
                          </button>
                        } @else if (file.downloadable) {
                          <button class="btn btn--ghost btn--sm btn--icon" type="button" [attr.data-tooltip]="file.exportExtension ? 'Baixar como .' + file.exportExtension : 'Baixar'" data-tooltip-pos="left" [attr.aria-label]="'Baixar ' + file.name" (click)="download(file)">
                            <sid3-icon name="download" />
                          </button>
                        }
                        <sid3-menu [label]="'Ações de ' + file.name">
                          @if (file.isFolder) {
                            <button class="menu-item" type="button" role="menuitem" (click)="openLocation(file.id)"><sid3-icon name="folder" />Abrir pasta</button>
                            <button class="menu-item" type="button" role="menuitem" [disabled]="downloadingId() === file.id" (click)="download(file)"><sid3-icon name="archive" />Baixar em ZIP</button>
                          }
                          @if (previewKind(file)) {
                            <button class="menu-item" type="button" role="menuitem" (click)="openPreview(file)"><sid3-icon name="eye" />Visualizar</button>
                          }
                          @if (file.downloadable) {
                            <button class="menu-item" type="button" role="menuitem" [disabled]="downloadingId() === file.id" (click)="download(file)">
                              <sid3-icon name="download" />{{ file.exportExtension ? 'Baixar como .' + file.exportExtension : 'Baixar' }}
                            </button>
                          }
                          <button class="menu-item" type="button" role="menuitem" (click)="toggleSelection(file, !isSelected(file))">
                            <sid3-icon name="link" />{{ isSelected(file) ? 'Tirar da seleção' : 'Selecionar para compartilhar' }}
                          </button>
                          @if (file.webViewLink) {
                            <hr class="menu-sep" />
                            <a class="menu-item" role="menuitem" [href]="file.webViewLink" target="_blank" rel="noopener noreferrer"><sid3-icon name="external" />Abrir no Google Drive</a>
                          }
                        </sid3-menu>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <div class="table-footer">
            <span class="tabular">{{ rangeLabel() }}</span>
            @if (totalPages() > 1) {
              <nav class="cluster" aria-label="Paginação">
                <button class="btn btn--sm btn--ghost" type="button" [disabled]="page() <= 1" (click)="goToPage(page() - 1)"><sid3-icon name="chev-left" />Anterior</button>
                <span class="tabular text-sm">Página {{ page() }} de {{ totalPages() }}</span>
                <button class="btn btn--sm btn--ghost" type="button" [disabled]="page() >= totalPages()" (click)="goToPage(page() + 1)">Próxima<sid3-icon name="chev" /></button>
              </nav>
            }
          </div>
        }
      </section>
    } @else if (errorMessage()) {
      <section class="card">
        <sid3-error-state title="Não foi possível carregar o status do Drive" [message]="errorMessage()!" (retry)="reloadConnections()" />
      </section>
    } @else {
      <section class="card"><sid3-skeleton [count]="6" /></section>
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
      <sid3-modal size="lg" [title]="current.file.name" [subtitle]="typeLabel(current.file) + ' · ' + bytes(current.file.sizeBytes)" (closed)="closePreview()">
        <div class="media-stage" [class.media-stage--light]="current.kind === 'text' || current.kind === 'pdf'">
          @if (current.loading) {
            <div class="state state--compact"><sid3-icon name="loader" size="lg" [spin]="true" /><p class="state__text">Carregando pré-visualização...</p></div>
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
        <footer modal-footer class="modal__footer">
          @if (current.file.webViewLink) {
            <a class="btn btn--ghost" [href]="current.file.webViewLink" target="_blank" rel="noopener noreferrer"><sid3-icon name="external" />Abrir no Drive</a>
          }
          <button class="btn btn--primary" type="button" [disabled]="downloadingId() === current.file.id" (click)="download(current.file)">
            <sid3-icon [name]="downloadingId() === current.file.id ? 'loader' : 'download'" [spin]="downloadingId() === current.file.id" />Baixar
          </button>
        </footer>
      </sid3-modal>
    }
  `,
  styles: [
    `
      :host ::ng-deep .split-btn { border-bottom-left-radius: 0; border-top-left-radius: 0; margin-left: -1px; }
      .drive-head { padding-bottom: var(--space-3); }
      .drive-index { align-items: center; display: flex; gap: var(--space-2); min-width: 0; }
      .file-name { align-items: center; display: flex; gap: var(--space-2); min-width: 0; }
      .file-name .btn--link { justify-content: flex-start; min-width: 0; }
      .file-icon { color: var(--color-muted); }
      .file-icon.is-folder { color: var(--color-accent-text); }
      .table .col-actions .cell-actions { min-width: 72px; }
      @media (max-width: 767px) {
        .segmented { width: 100%; }
        .segmented button { flex: 1; font-size: var(--text-xs); height: auto; justify-content: center; line-height: 1.2; min-height: 36px; padding: var(--space-1) var(--space-2); text-align: center; white-space: normal; }
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DrivePageComponent {
  private readonly connectionsService = inject(ConnectionsService);
  private readonly projectsService = inject(ProjectsService);
  protected readonly projectContext = inject(ProjectContextService);
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

    toObservable(this.projectContext.currentProjectId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((projectId) => this.loadConnections(projectId));
  }

  protected connectionLabel(connection: Connection): string {
    return connection.displayName ?? connection.providerAccountEmail ?? 'Google Drive';
  }

  protected fileIcon(file: DriveFile): string {
    if (file.isSharedDrive) return 'server';
    if (file.isFolder) return 'folder';
    const kind = drivePreviewKind(file);
    if (kind === 'image') return 'image';
    if (kind === 'video') return 'video';
    if (kind === 'audio') return 'music';
    return 'file';
  }

  protected rangeLabel(): string {
    const listing = this.listing();
    if (!listing || listing.total === 0) return '';
    const start = (this.page() - 1) * listing.pageSize + 1;
    const end = Math.min(start + listing.items.length - 1, listing.total);
    return `${start}–${end} de ${listing.total.toLocaleString('pt-BR')} itens`;
  }

  protected reloadConnections(): void {
    this.errorMessage.set(null);
    this.loadConnections(this.projectContext.currentProjectId());
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

  /** Só as contas adicionadas ao projeto atual aparecem aqui. */
  private loadConnections(projectId: string | null): void {
    this.pollSubscription?.unsubscribe();
    this.connections.set([]);
    this.selectedConnectionId.set(null);
    this.status.set(null);
    this.listing.set(null);
    if (!projectId) {
      this.isLoadingConnections.set(false);
      return;
    }
    this.isLoadingConnections.set(true);
    this.projectsService
      .listProjectConnections(projectId)
      .pipe(
        map((links) => links.map((link) => toConnection(link))),
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

function toConnection(link: ProjectConnection): Connection {
  return {
    id: link.connectionId,
    provider: 'GOOGLE_DRIVE',
    displayName: link.displayName,
    providerAccountEmail: link.providerAccountEmail,
    status: link.status,
    scopes: [],
    sid3RootFolderStatus: link.sid3RootFolderStatus,
    lastError: link.lastError,
    lastErrorAt: null,
    projects: [],
    createdAt: link.linkedAt
  };
}
