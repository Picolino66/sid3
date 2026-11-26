import { DatePipe } from '@angular/common';
import { HttpEventType } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, concatMap, filter, finalize, forkJoin, from, of, switchMap, tap } from 'rxjs';
import { toApiErrorMessage } from '../../core/api/api-error';
import { ProjectContextService } from '../../core/project-context/project-context.service';
import { formatBytes } from '../../shared/ui/format';
import { NoProjectStateComponent } from '../../shared/ui/no-project-state.component';
import { Bucket } from '../buckets/bucket.models';
import { BucketsService } from '../buckets/buckets.service';
import { ProjectConnection } from '../projects/project.models';
import { ProjectsService } from '../projects/projects.service';
import { ObjectsService } from './objects.service';
import { StorageObject } from './storage-object.models';

type ViewMode = 'folders' | 'recent';
type FileKind = 'image' | 'video' | 'other';

/** Explorador dos arquivos do projeto: pastas, miniaturas, paginação, envio e exclusão — sem chave de API. */
@Component({
  selector: 'sid3-files-page',
  imports: [DatePipe, RouterLink, NoProjectStateComponent],
  template: `
    <header class="topbar">
      <div>
        <p class="eyebrow">{{ projectContext.currentProject()?.name ?? 'Projeto' }}</p>
        <h1>Arquivos</h1>
      </div>
      @if (selectedBucket()) {
        <label class="button-link upload-button" [class.disabled]="!canUpload()">
          {{ uploadLabel() }}
          <input type="file" multiple hidden [disabled]="!canUpload()" (change)="uploadFiles($any($event.target))" />
        </label>
      }
    </header>

    @if (projectContext.loaded() && !projectContext.currentProjectId()) {
      <sid3-no-project-state />
    } @else {
      @if (errorMessage()) {
        <p class="form-error">{{ errorMessage() }}</p>
      }

      @if (bucketWarning(); as warning) {
        <div class="banner-warning" role="alert">
          <div>{{ warning }}</div>
          <a routerLink="/connections">Ir para Conexões</a>
        </div>
      }

      @if (buckets().length === 0 && !isLoadingBuckets()) {
        <section class="panel empty-cta">
          <p class="muted">Este projeto ainda não tem buckets.</p>
          <a class="button-link" routerLink="/storage">Criar bucket em Armazenamento</a>
        </section>
      } @else {
        <section class="files-toolbar">
          <label>
            <span class="muted">Bucket</span>
            <select [value]="selectedBucketId()" (change)="selectBucket($any($event.target).value)">
              @for (bucket of buckets(); track bucket.id) {
                <option [value]="bucket.id">{{ bucket.name }} ({{ bucket.objectCount }})</option>
              }
            </select>
          </label>
          <div class="segmented" role="group" aria-label="Modo de visualização">
            <button type="button" [class.active]="viewMode() === 'folders'" (click)="setViewMode('folders')">Pastas</button>
            <button type="button" [class.active]="viewMode() === 'recent'" (click)="setViewMode('recent')">Mais recentes</button>
          </div>
        </section>

        @if (viewMode() === 'folders') {
          <nav class="breadcrumb" aria-label="Pasta atual">
            <button type="button" (click)="openFolder('')">{{ selectedBucket()?.name ?? 'bucket' }}</button>
            @for (crumb of breadcrumbs(); track crumb.prefix) {
              <span aria-hidden="true">/</span>
              <button type="button" (click)="openFolder(crumb.prefix)">{{ crumb.label }}</button>
            }
          </nav>
        }

        @if (uploadStatus()) {
          <p class="muted" role="status">{{ uploadStatus() }}</p>
        }

        @if (folders().length > 0) {
          <div class="folder-grid">
            @for (folder of folders(); track folder) {
              <button type="button" class="folder-tile" (click)="openFolder(folder)">
                <span class="folder-icon" aria-hidden="true">📁</span>
                <span>{{ folderName(folder) }}</span>
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
                    <img [src]="url(object)" [alt]="object.fileName" loading="lazy" decoding="async" />
                  }
                  @case ('video') {
                    <span class="media-placeholder" aria-hidden="true">▶</span>
                  }
                  @default {
                    <span class="media-placeholder" aria-hidden="true">📄</span>
                  }
                }
                <span class="media-caption">
                  <span class="media-name">{{ object.fileName }}</span>
                  @if (object.status !== 'AVAILABLE') {
                    <span [class]="'status-label ' + object.status.toLowerCase()">{{ object.status }}</span>
                  }
                </span>
              </button>
            }
          </div>
        } @else if (!isLoading() && folders().length === 0) {
          <p class="empty-state">Nenhum arquivo {{ prefix() ? 'nesta pasta' : 'neste bucket' }}.</p>
        }

        @if (isLoading()) {
          <p class="muted">Carregando arquivos...</p>
        } @else if (nextCursor()) {
          <button type="button" class="secondary load-more" (click)="loadMore()">Carregar mais</button>
        }
      }
    }

    @if (preview(); as object) {
      <div class="modal-overlay" role="presentation" (click)="preview.set(null)">
        <div class="preview-modal-panel" role="dialog" aria-modal="true" [attr.aria-label]="object.fileName" (click)="$event.stopPropagation()">
          <header class="preview-header">
            <strong>{{ object.fileName }}</strong>
            <button type="button" class="secondary compact-button" (click)="preview.set(null)">Fechar</button>
          </header>
          <div class="preview-body">
            @switch (kindOf(object)) {
              @case ('image') {
                <img [src]="url(object)" [alt]="object.fileName" />
              }
              @case ('video') {
                <video [src]="url(object)" controls autoplay preload="metadata"></video>
              }
              @default {
                <p class="muted">Pré-visualização indisponível para {{ object.contentType }}.</p>
              }
            }
          </div>
          <dl class="preview-meta">
            <dt>Caminho</dt><dd>{{ object.key }}</dd>
            <dt>Tamanho</dt><dd>{{ bytes(object.sizeBytes) }}</dd>
            <dt>Enviado em</dt><dd>{{ object.createdAt | date: 'dd/MM/yyyy HH:mm' }}</dd>
          </dl>
          <div class="modal-actions">
            <button type="button" class="danger compact-button" [disabled]="isDeleting()" (click)="deleteObject(object)">
              {{ isDeleting() ? 'Excluindo...' : 'Excluir' }}
            </button>
            @if (url(object); as href) {
              <a class="button-link compact-button" [href]="href" [attr.download]="object.fileName">Baixar</a>
            }
          </div>
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FilesPageComponent {
  protected readonly projectContext = inject(ProjectContextService);
  private readonly bucketsService = inject(BucketsService);
  private readonly projectsService = inject(ProjectsService);
  private readonly objectsService = inject(ObjectsService);

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
    const name = connection.displayName ?? 'GOOGLE_DRIVE';
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
    this.errorMessage.set(null);

    from(files)
      .pipe(
        concatMap((file) =>
          this.objectsService.uploadObjectWithProgress(projectId, bucketId, `${prefix}${file.name}`, file).pipe(
            tap((event) => {
              if (event.type === HttpEventType.UploadProgress && event.total) {
                const percent = Math.round((event.loaded / event.total) * 100);
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
          this.uploadStatus.set(`${done} de ${files.length} arquivo(s) enviados.`);
          if (failures.length > 0) this.errorMessage.set(failures.join(' · '));
          this.reloadObjects();
        })
      )
      .subscribe();
  }

  deleteObject(object: StorageObject): void {
    const projectId = this.projectContext.currentProjectId();
    if (!projectId) return;
    if (!window.confirm(`Excluir "${object.fileName}"? O arquivo também será apagado do Google Drive.`)) return;

    this.isDeleting.set(true);
    this.objectsService
      .deleteObject(projectId, object.bucketId, object.id)
      .pipe(finalize(() => this.isDeleting.set(false)))
      .subscribe({
        next: () => {
          this.preview.set(null);
          this.objects.update((items) => items.filter((item) => item.id !== object.id));
        },
        error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
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
    this.isLoadingBuckets.set(true);
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
        this.errorMessage.set(toApiErrorMessage(error));
        return of(null);
      }),
      finalize(() => this.isLoadingBuckets.set(false))
    );
  }

  private reloadObjects(): void {
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
