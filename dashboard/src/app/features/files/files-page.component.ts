import { DatePipe } from '@angular/common';
import { HttpEventType } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, concatMap, filter, finalize, forkJoin, from, of, switchMap, tap } from 'rxjs';
import { toApiErrorDetails, toApiErrorMessage } from '../../core/api/api-error';
import { NotificationService } from '../../core/notifications/notification.service';
import { ConfirmService } from '../../shared/ui/confirm.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { ErrorStateComponent } from '../../shared/ui/error-state.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { SkeletonComponent } from '../../shared/ui/skeleton.component';
import { ProjectContextService } from '../../core/project-context/project-context.service';
import { formatBytes, Tone } from '../../shared/ui/format';
import { NoProjectStateComponent } from '../../shared/ui/no-project-state.component';
import { Bucket } from '../buckets/bucket.models';
import { BucketsService } from '../buckets/buckets.service';
import { ProjectConnection } from '../projects/project.models';
import { ProjectsService } from '../projects/projects.service';
import { ObjectsService } from './objects.service';
import { StorageObject, StorageObjectStatus } from './storage-object.models';

type ViewMode = 'folders' | 'recent';
type FileKind = 'image' | 'video' | 'other';

const STATUS_LABELS: Record<StorageObjectStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Processando', tone: 'info' },
  AVAILABLE: { label: 'Disponível', tone: 'success' },
  DELETING: { label: 'Excluindo', tone: 'warn' },
  DELETED: { label: 'Excluído', tone: 'neutral' },
  FAILED: { label: 'Falhou', tone: 'danger' }
};

/** Explorador dos arquivos do projeto: pastas, miniaturas, paginação, envio e exclusão — sem chave de API. */
@Component({
  selector: 'sid3-files-page',
  imports: [
    DatePipe,
    RouterLink,
    NoProjectStateComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    IconComponent,
    ModalComponent,
    PageHeaderComponent,
    SkeletonComponent
  ],
  template: `
    <sid3-page-header title="Arquivos" description="Arquivos guardados pelo SID3 nos buckets deste projeto.">
      @if (selectedBucket()) {
        <label class="btn btn--primary" [attr.aria-disabled]="!canUpload()" [class.is-busy]="isUploading()">
          <sid3-icon [name]="isUploading() ? 'loader' : 'upload'" [spin]="isUploading()" />
          {{ uploadLabel() }}
          <input type="file" multiple class="sr-only" [disabled]="!canUpload()" (change)="uploadFiles($any($event.target))" />
        </label>
      }
    </sid3-page-header>

    @if (projectContext.loaded() && !projectContext.currentProjectId()) {
      <sid3-no-project-state />
    } @else {
      @if (bucketWarning(); as warning) {
        <div class="callout callout--warn" role="alert">
          <sid3-icon name="alert" />
          <span class="callout__text">{{ warning }}</span>
          <a class="btn btn--sm" routerLink="/connections">Ir para Conexões</a>
        </div>
      }

      @if (isUploading() || uploadStatus()) {
        <div class="callout" [class.callout--success]="!isUploading()" role="status" aria-live="polite">
          <sid3-icon [name]="isUploading() ? 'upload' : 'ok'" />
          <div class="callout__text stack-sm" style="gap: 6px">
            <span>{{ uploadStatus() }}</span>
            @if (isUploading()) {
              <span class="meter"><span [style.width.%]="uploadPercent()"></span></span>
            }
          </div>
          @if (!isUploading()) {
            <button class="btn btn--ghost btn--icon btn--sm" type="button" aria-label="Fechar aviso" (click)="uploadStatus.set(null)"><sid3-icon name="x" /></button>
          }
        </div>
      }

      @if (isLoadingBuckets() && buckets().length === 0) {
        <section class="card card__body"><sid3-skeleton variant="grid" [count]="8" /></section>
      } @else if (bucketsError(); as failure) {
        <section class="card">
          <sid3-error-state title="Não foi possível carregar os buckets" [message]="failure.message" [details]="failure.details" (retry)="reloadProject()" />
        </section>
      } @else if (buckets().length === 0) {
        <section class="card">
          <sid3-empty-state icon="folder" title="Este projeto ainda não tem buckets" description="Buckets são as pastas onde os arquivos ficam. Crie um em Armazenamento.">
            <a class="btn btn--primary" routerLink="/storage">Criar bucket</a>
          </sid3-empty-state>
        </section>
      } @else {
        <section class="card">
          <div class="toolbar">
            <div class="toolbar__group">
              <label class="cluster" style="gap: var(--space-2)">
                <span class="muted text-sm">Bucket</span>
                <select class="select select--sm" style="width: auto; max-width: 260px" [value]="selectedBucketId()" (change)="selectBucket($any($event.target).value)">
                  @for (bucket of buckets(); track bucket.id) {
                    <option [value]="bucket.id" [selected]="bucket.id === selectedBucketId()">{{ bucket.name }} ({{ bucket.objectCount }})</option>
                  }
                </select>
              </label>
            </div>
            <div class="segmented" role="group" aria-label="Modo de visualização">
              <button type="button" [attr.aria-pressed]="viewMode() === 'folders'" (click)="setViewMode('folders')"><sid3-icon name="folder" size="sm" />Pastas</button>
              <button type="button" [attr.aria-pressed]="viewMode() === 'recent'" (click)="setViewMode('recent')"><sid3-icon name="clock" size="sm" />Mais recentes</button>
            </div>
          </div>

          @if (viewMode() === 'folders') {
            <nav class="crumbs files-crumbs" aria-label="Pasta atual">
              <button class="crumbs__item" type="button" [attr.aria-current]="breadcrumbs().length === 0 ? 'page' : null" (click)="openFolder('')">
                {{ selectedBucket()?.name ?? 'bucket' }}
              </button>
              @for (crumb of breadcrumbs(); track crumb.prefix; let last = $last) {
                <sid3-icon class="crumbs__sep" name="chev" size="sm" />
                <button class="crumbs__item" type="button" [attr.aria-current]="last ? 'page' : null" (click)="openFolder(crumb.prefix)">{{ crumb.label }}</button>
              }
            </nav>
          }

          <div class="card__body files-body" [attr.aria-busy]="isLoading()">
            @if (errorMessage()) {
              <sid3-error-state title="Não foi possível listar os arquivos" [message]="errorMessage()!" [compact]="true" (retry)="reloadObjects()" />
            } @else {
              @if (folders().length > 0) {
                <div class="folder-grid">
                  @for (folder of folders(); track folder) {
                    <button type="button" class="folder-tile" (click)="openFolder(folder)">
                      <sid3-icon name="folder" />
                      <span class="truncate">{{ folderName(folder) }}</span>
                    </button>
                  }
                </div>
              }

              @if (objects().length > 0) {
                <div class="media-grid">
                  @for (object of objects(); track object.id) {
                    <button type="button" class="media-tile" (click)="preview.set(object)" [title]="object.key">
                      @switch (kindOf(object)) {
                        @case ('image') {
                          @if (url(object); as src) {
                            <img [src]="src" [alt]="object.fileName" loading="lazy" decoding="async" />
                          } @else {
                            <span class="media-tile__ph"><sid3-icon name="image" size="lg" /></span>
                          }
                        }
                        @case ('video') {
                          <span class="media-tile__ph"><sid3-icon name="video" size="lg" /></span>
                        }
                        @default {
                          <span class="media-tile__ph"><sid3-icon name="file" size="lg" /></span>
                        }
                      }
                      <span class="media-tile__caption">
                        <span class="truncate">{{ object.fileName }}</span>
                        @if (object.status !== 'AVAILABLE') {
                          <span [class]="'chip chip--' + statusTone(object.status)">{{ statusLabel(object.status) }}</span>
                        }
                      </span>
                    </button>
                  }
                </div>
              } @else if (!isLoading() && folders().length === 0) {
                <sid3-empty-state
                  icon="upload"
                  [title]="prefix() ? 'Esta pasta está vazia' : 'Nenhum arquivo neste bucket'"
                  description="Envie arquivos pelo botão acima ou pela API com uma chave do projeto."
                  [compact]="true"
                />
              }

              @if (isLoading()) {
                <sid3-skeleton variant="grid" [count]="objects().length > 0 ? 4 : 8" label="Carregando arquivos" />
              } @else if (nextCursor()) {
                <div class="cluster" style="justify-content: center; margin-top: var(--space-5)">
                  <button type="button" class="btn" (click)="loadMore()"><sid3-icon name="chev-down" />Carregar mais</button>
                </div>
              }
            }
          </div>
        </section>
      }
    }

    @if (preview(); as object) {
      <sid3-modal size="lg" [title]="object.fileName" [subtitle]="bytes(object.sizeBytes) + ' · ' + object.contentType" (closed)="preview.set(null)">
        <div class="media-stage" [class.media-stage--light]="kindOf(object) === 'other'">
          @switch (kindOf(object)) {
            @case ('image') {
              @if (url(object); as src) {
                <img [src]="src" [alt]="object.fileName" />
              } @else {
                <div class="state state--compact"><span class="state__icon"><sid3-icon name="image" size="lg" /></span><p class="state__text">Pré-visualização indisponível no momento.</p></div>
              }
            }
            @case ('video') {
              <video [src]="url(object)" controls autoplay preload="metadata"></video>
            }
            @default {
              <div class="state state--compact">
                <span class="state__icon"><sid3-icon name="file" size="lg" /></span>
                <p class="state__text">Pré-visualização indisponível para este tipo de arquivo.</p>
              </div>
            }
          }
        </div>
        <dl class="meta-list">
          <dt>Caminho</dt>
          <dd class="mono">{{ object.key }}</dd>
          <dt>Enviado em</dt>
          <dd>{{ object.createdAt | date: 'dd/MM/yyyy HH:mm' }}</dd>
          <dt>Status</dt>
          <dd><span [class]="'chip chip--' + statusTone(object.status)">{{ statusLabel(object.status) }}</span></dd>
        </dl>
        <footer modal-footer class="modal__footer modal__footer--between">
          <button type="button" class="btn btn--danger-ghost" [disabled]="isDeleting()" (click)="deleteObject(object)">
            <sid3-icon [name]="isDeleting() ? 'loader' : 'trash'" [spin]="isDeleting()" />{{ isDeleting() ? 'Excluindo...' : 'Excluir' }}
          </button>
          @if (url(object); as href) {
            <a class="btn btn--primary" [href]="href" [attr.download]="object.fileName"><sid3-icon name="download" />Baixar</a>
          }
        </footer>
      </sid3-modal>
    }
  `,
  styles: [
    `
      label.btn { cursor: pointer; }
      label.btn[aria-disabled='true'] { cursor: not-allowed; opacity: 0.5; }
      label.btn:focus-within { outline: 2px solid var(--color-focus); outline-offset: 2px; }
      .files-crumbs { padding: 0 var(--space-4) var(--space-1); }
      .files-body { padding-top: var(--space-3); }
      .folder-grid { display: grid; gap: var(--space-2); grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); margin-bottom: var(--space-5); }
      .folder-tile { align-items: center; background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-md); color: var(--color-ink); cursor: pointer; display: flex; gap: var(--space-2); height: 44px; padding: 0 var(--space-3); text-align: left; transition: border-color var(--dur-fast) var(--ease-out), background-color var(--dur-fast) var(--ease-out); }
      .folder-tile sid3-icon { color: var(--color-accent-text); }
      .folder-tile:hover { background: var(--color-soft); border-color: var(--color-line-strong); }
      .media-grid { display: grid; gap: var(--space-3); grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
      .media-tile { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-md); color: var(--color-ink); cursor: pointer; display: flex; flex-direction: column; overflow: hidden; padding: 0; text-align: left; transition: border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out); }
      .media-tile:hover { border-color: var(--color-line-strong); box-shadow: var(--shadow-pop); transform: translateY(-1px); }
      .media-tile img, .media-tile__ph { aspect-ratio: 1; background: var(--color-soft); display: block; object-fit: cover; width: 100%; }
      .media-tile__ph { align-items: center; color: var(--color-muted); display: flex; justify-content: center; }
      .media-tile__caption { align-items: center; display: flex; font-size: var(--text-xs); gap: 6px; justify-content: space-between; min-width: 0; padding: var(--space-2) var(--space-3); }
      @media (max-width: 640px) {
        .media-grid { grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: var(--space-2); }
        .folder-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FilesPageComponent {
  protected readonly projectContext = inject(ProjectContextService);
  private readonly bucketsService = inject(BucketsService);
  private readonly projectsService = inject(ProjectsService);
  private readonly objectsService = inject(ObjectsService);
  private readonly notifications = inject(NotificationService);
  private readonly confirm = inject(ConfirmService);

  protected readonly buckets = signal<Bucket[]>([]);
  protected readonly projectConnections = signal<ProjectConnection[]>([]);
  protected readonly selectedBucketId = signal('');
  protected readonly viewMode = signal<ViewMode>('folders');
  protected readonly prefix = signal('');
  protected readonly folders = signal<string[]>([]);
  protected readonly objects = signal<StorageObject[]>([]);
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly isLoadingBuckets = signal(false);
  protected readonly isLoading = signal(false);
  protected readonly isDeleting = signal(false);
  protected readonly uploadStatus = signal<string | null>(null);
  protected readonly isUploading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly preview = signal<StorageObject | null>(null);
  protected readonly uploadPercent = signal(0);
  protected readonly bucketsError = signal<{ message: string; details: string | null } | null>(null);
  private readonly projectReload = signal(0);

  protected readonly selectedBucket = computed(() => this.buckets().find((bucket) => bucket.id === this.selectedBucketId()) ?? null);
  protected readonly bucketConnection = computed(() => {
    const bucket = this.selectedBucket();
    return bucket?.providerIntegrationId
      ? this.projectConnections().find((connection) => connection.connectionId === bucket.providerIntegrationId) ?? null
      : null;
  });
  protected readonly bucketWarning = computed(() => {
    const connection = this.bucketConnection();
    if (!connection) return null;
    const name = connection.displayName ?? 'Google Drive';
    if (connection.status !== 'CONNECTED') return `A conta "${name}" deste bucket não está ativa: envios bloqueados até reconectar.`;
    if (connection.sid3RootFolderStatus === 'PENDING_CONFIRMATION') {
      return `A conta "${name}" tem uma pasta "sid3" aguardando confirmação. Resolva em Conexões para liberar os envios.`;
    }
    return null;
  });
  protected readonly canUpload = computed(() => Boolean(this.selectedBucket()) && !this.bucketWarning() && !this.isUploading());
  protected readonly uploadLabel = computed(() =>
    this.isUploading() ? 'Enviando...' : this.prefix() ? `Enviar para ${this.prefix()}` : 'Enviar arquivos'
  );
  protected readonly breadcrumbs = computed(() => {
    const parts = this.prefix().split('/').filter(Boolean);
    return parts.map((label, index) => ({ label, prefix: `${parts.slice(0, index + 1).join('/')}/` }));
  });

  constructor() {
    toObservable(this.projectContext.currentProjectId)
      .pipe(
        filter((projectId): projectId is string => Boolean(projectId)),
        switchMap((projectId) => this.loadProject(projectId)),
        takeUntilDestroyed()
      )
      .subscribe();
    toObservable(this.projectReload)
      .pipe(
        filter((tick) => tick > 0),
        switchMap(() => this.loadProject(this.projectContext.currentProjectId() ?? '')),
        takeUntilDestroyed()
      )
      .subscribe();
  }

  reloadProject(): void {
    this.projectReload.update((tick) => tick + 1);
  }

  protected statusLabel(status: StorageObjectStatus): string {
    return STATUS_LABELS[status]?.label ?? status;
  }

  protected statusTone(status: StorageObjectStatus): Tone {
    return STATUS_LABELS[status]?.tone ?? 'neutral';
  }

  selectBucket(bucketId: string): void {
    this.selectedBucketId.set(bucketId);
    this.prefix.set('');
    this.reloadObjects();
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode.set(mode);
    this.prefix.set('');
    this.reloadObjects();
  }

  openFolder(prefix: string): void {
    this.viewMode.set('folders');
    this.prefix.set(prefix);
    this.reloadObjects();
  }

  loadMore(): void {
    this.fetchPage(this.nextCursor());
  }

  uploadFiles(input: HTMLInputElement): void {
    const projectId = this.projectContext.currentProjectId();
    const bucketId = this.selectedBucketId();
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!projectId || !bucketId || files.length === 0) return;

    const prefix = this.viewMode() === 'folders' ? this.prefix() : '';
    let done = 0;
    const failures: string[] = [];
    this.isUploading.set(true);
    this.uploadPercent.set(0);

    from(files)
      .pipe(
        concatMap((file) =>
          this.objectsService.uploadObjectWithProgress(projectId, bucketId, `${prefix}${file.name}`, file).pipe(
            tap((event) => {
              if (event.type === HttpEventType.UploadProgress && event.total) {
                const percent = Math.round((event.loaded / event.total) * 100);
                this.uploadPercent.set(Math.round(((done + percent / 100) / files.length) * 100));
                this.uploadStatus.set(`Enviando ${done + 1} de ${files.length}: ${file.name} (${percent}%)`);
              }
            }),
            filter((event) => event.type === HttpEventType.Response),
            tap(() => (done += 1)),
            catchError((error: unknown) => {
              failures.push(`${file.name}: ${toApiErrorMessage(error)}`);
              return of(null);
            })
          )
        ),
        finalize(() => {
          this.isUploading.set(false);
          this.uploadStatus.set(
            files.length === 1 ? (done === 1 ? 'Arquivo enviado.' : 'O arquivo não foi enviado.') : `${done} de ${files.length} arquivos enviados.`
          );
          if (failures.length > 0) this.notifications.error(failures.join(' · '), 10000);
          this.reloadObjects();
        })
      )
      .subscribe();
  }

  async deleteObject(object: StorageObject): Promise<void> {
    const projectId = this.projectContext.currentProjectId();
    if (!projectId) return;
    const confirmed = await this.confirm.ask({
      title: `Excluir "${object.fileName}"?`,
      message: 'O arquivo também será apagado do Google Drive. Essa ação não pode ser desfeita.',
      confirmLabel: 'Excluir arquivo'
    });
    if (!confirmed) return;

    this.isDeleting.set(true);
    this.objectsService
      .deleteObject(projectId, object.bucketId, object.id)
      .pipe(finalize(() => this.isDeleting.set(false)))
      .subscribe({
        next: () => {
          this.preview.set(null);
          this.objects.update((items) => items.filter((item) => item.id !== object.id));
          this.notifications.success(`"${object.fileName}" excluído.`);
        },
        error: (error: unknown) => this.notifications.error(toApiErrorMessage(error))
      });
  }

  protected url(object: StorageObject): string | null {
    return this.objectsService.absoluteUrl(object.downloadUrl);
  }

  protected kindOf(object: StorageObject): FileKind {
    if (object.contentType.startsWith('image/')) return 'image';
    if (object.contentType.startsWith('video/')) return 'video';
    return 'other';
  }

  protected folderName(folder: string): string {
    return folder.slice(this.prefix().length).replace(/\/$/, '');
  }

  protected bytes(value: number): string {
    return formatBytes(value);
  }

  private loadProject(projectId: string) {
    if (!projectId) return of(null);
    this.isLoadingBuckets.set(true);
    this.bucketsError.set(null);
    return forkJoin({
      buckets: this.bucketsService.listBuckets(projectId),
      connections: this.projectsService.listProjectConnections(projectId)
    }).pipe(
      tap(({ buckets, connections }) => {
        this.buckets.set(buckets);
        this.projectConnections.set(connections);
        const keep = buckets.some((bucket) => bucket.id === this.selectedBucketId());
        this.selectedBucketId.set(keep ? this.selectedBucketId() : (buckets[0]?.id ?? ''));
        this.prefix.set('');
        this.reloadObjects();
      }),
      catchError((error: unknown) => {
        this.bucketsError.set({ message: toApiErrorMessage(error), details: toApiErrorDetails(error) });
        return of(null);
      }),
      finalize(() => this.isLoadingBuckets.set(false))
    );
  }

  reloadObjects(): void {
    this.objects.set([]);
    this.folders.set([]);
    this.nextCursor.set(null);
    this.fetchPage(null);
  }

  private fetchPage(cursor: string | null): void {
    const projectId = this.projectContext.currentProjectId();
    const bucketId = this.selectedBucketId();
    if (!projectId || !bucketId) return;

    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.objectsService
      .listObjects(projectId, bucketId, {
        prefix: this.viewMode() === 'folders' ? this.prefix() : undefined,
        delimiter: this.viewMode() === 'folders' ? '/' : '',
        cursor,
        limit: 60
      })
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (page) => {
          if (!cursor) this.folders.set(page.folders);
          this.objects.update((items) => (cursor ? [...items, ...page.items] : page.items));
          this.nextCursor.set(page.nextCursor);
        },
        error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
      });
  }
}
