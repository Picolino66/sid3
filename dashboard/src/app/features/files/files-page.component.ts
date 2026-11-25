import { DatePipe } from '@angular/common';
import { HttpEventType } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { toApiErrorMessage } from '../../core/api/api-error';
import { NotificationService } from '../../core/notifications/notification.service';
import { ApiKey } from '../api-keys/api-key.models';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { Bucket } from '../buckets/bucket.models';
import { BucketsService } from '../buckets/buckets.service';
import { Connection } from '../connections/connection.models';
import { ConnectionsService } from '../connections/connections.service';
import { Project } from '../projects/project.models';
import { ProjectsService } from '../projects/projects.service';
import { ObjectsService } from './objects.service';
import { StorageObject } from './storage-object.models';

@Component({
  selector: 'sid3-files-page',
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  template: `
    <header class="topbar">
      <div>
        <h1>Arquivos</h1>
      </div>
      <button type="button" [disabled]="!canListObjects() || isLoading()" (click)="loadObjects()">
        {{ isLoading() ? 'Carregando...' : 'Atualizar' }}
      </button>
    </header>

    @if (isConnectionPendingConfirmation()) {
      <div class="banner-warning" role="alert">
        <div>
          <strong>Aviso Importante:</strong> A conexão Google Drive vinculada a este bucket possui confirmação de pasta raiz <code>sid3</code> pendente. Resolva a confirmação antes de enviar arquivos.
        </div>
        <a routerLink="/connections">Ir para Conexões</a>
      </div>
    }

    <section class="split-layout">
      <form class="panel" [formGroup]="form" (ngSubmit)="uploadObject()">
        <header>
          <h2>Enviar arquivo</h2>
        </header>

        <label>
          Projeto
          <select [value]="selectedProjectId()" (change)="selectProject($event)">
            @for (project of projects(); track project.id) {
              <option [value]="project.id">{{ project.name }}</option>
            }
          </select>
        </label>

        <label>
          Bucket
          <select [value]="selectedBucketId()" (change)="selectBucket($event)">
            @for (bucket of buckets(); track bucket.id) {
              <option [value]="bucket.id">{{ bucket.name }}</option>
            }
          </select>
        </label>

        <label>
          Chave de API
          <select [value]="selectedApiKeyId()" (change)="selectApiKey($event)">
            @for (apiKey of activeApiKeys(); track apiKey.id) {
              <option [value]="apiKey.id">{{ apiKey.name }} - {{ apiKey.prefix }}</option>
            }
          </select>
        </label>

        <label>
          Segredo da chave de API
          <input type="password" formControlName="apiKeySecret" placeholder="sid3_live_..." autocomplete="off" />
        </label>
        <p class="field-hint">Cole o segredo exibido ao criar a chave — não é o prefixo.</p>

        <label>
          Caminho do arquivo
          <input type="text" formControlName="key" placeholder="fotos/minha-foto.png" />
        </label>

        <label>
          Arquivo
          <input type="file" (change)="selectFile($event)" />
        </label>

        @if (errorMessage()) {
          <p class="form-error">{{ errorMessage() }}</p>
        }

        @if (isSubmitting() && uploadProgress() !== null) {
          <div class="upload-progress-container" role="progressbar" [attr.aria-valuenow]="uploadProgress()" aria-valuemin="0" aria-valuemax="100">
            <div class="upload-progress-bar" [style.width.%]="uploadProgress()"></div>
            <span class="upload-progress-text">Enviando: {{ uploadProgress() }}%</span>
          </div>
        }

        @if (!canUploadObject()) {
          <div class="requirement-list" aria-label="Requisitos para envio">
            @for (requirement of uploadRequirements(); track requirement) {
              <span>{{ requirement }}</span>
            }
          </div>
        }

        <button type="submit" [disabled]="!canUploadObject() || isSubmitting()">
          {{ isSubmitting() ? 'Enviando...' : 'Enviar arquivo' }}
        </button>
      </form>

      <section class="panel">
        <header>
          <h2>{{ selectedBucket()?.name ?? 'Arquivos do bucket' }}</h2>
        </header>

        <label class="inline-filter">
          Prefixo
          <input type="text" [value]="prefix()" (input)="prefix.set($any($event.target).value)" placeholder="avatares/" />
        </label>

        @if (isLoading()) {
          <p class="muted">Carregando objetos...</p>
        } @else if (objects().length === 0) {
          <p class="empty-state">Nenhum arquivo enviado para este bucket ainda.</p>
        } @else {
          <div class="table files-table" role="table" aria-label="Arquivos">
            <div role="row" class="head">
              <span role="columnheader">Chave</span>
              <span role="columnheader">Tipo</span>
              <span role="columnheader">Tamanho</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Atualizado em</span>
              <span role="columnheader">Ações</span>
            </div>
            @for (object of objects(); track object.id) {
              <div role="row">
                <span role="cell">{{ object.key }}</span>
                <span role="cell">{{ object.contentType }}</span>
                <span role="cell">{{ formatBytes(object.sizeBytes) }}</span>
                <span role="cell">
                  <span [class]="'status-label ' + objectStatusClass(object.status)">
                    {{ objectStatusLabel(object.status) }}
                  </span>
                </span>
                <span role="cell">{{ object.updatedAt | date: 'dd/MM/yyyy HH:mm' }}</span>
                <span role="cell" class="action-cell">
                  @if (isPreviewable(object)) {
                    <button class="compact-button secondary" type="button" (click)="openPreview(object)">Ver</button>
                  }
                  <button class="compact-button" type="button" (click)="download(object)">Baixar</button>
                  <button class="compact-button secondary" type="button" (click)="copySignedUrl(object)" title="Copiar URL temporária assinada de 15 minutos">Link</button>
                  <button class="danger compact-button" type="button" (click)="deleteObject(object)">Excluir</button>
                </span>
              </div>
            }
          </div>
        }
      </section>
    </section>

    @if (previewObject()) {
      <div class="modal-overlay" (click)="closePreview()">
        <div class="preview-modal-panel" (click)="$event.stopPropagation()">
          <header>
            <h3>{{ previewObject()?.fileName }}</h3>
            <p class="field-hint">{{ previewObject()?.contentType }} — {{ formatBytes(previewObject()?.sizeBytes ?? 0) }}</p>
          </header>

          <div class="preview-content">
            @if (isPreviewLoading()) {
              <p class="muted">Carregando pré-visualização...</p>
            } @else if (previewText() !== null) {
              <pre><code>{{ previewText() }}</code></pre>
            } @else if (previewUrl() && isImage(previewObject()!)) {
              <img [src]="previewUrl()" [alt]="previewObject()?.fileName" />
            } @else if (previewUrl() && isPdf(previewObject()!)) {
              <iframe [src]="previewUrl()"></iframe>
            } @else {
              <p class="muted">Visualização direta não suportada para este tipo de arquivo.</p>
            }
          </div>

          <div class="modal-actions">
            <button class="secondary" type="button" (click)="closePreview()">Fechar</button>
            <button type="button" (click)="download(previewObject()!)">Baixar</button>
          </div>
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FilesPageComponent {
  private readonly projectsService = inject(ProjectsService);
  private readonly bucketsService = inject(BucketsService);
  private readonly apiKeysService = inject(ApiKeysService);
  private readonly connectionsService = inject(ConnectionsService);
  private readonly objectsService = inject(ObjectsService);
  private readonly notificationService = inject(NotificationService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly projects = signal<Project[]>([]);
  protected readonly buckets = signal<Bucket[]>([]);
  protected readonly connections = signal<Connection[]>([]);
  protected readonly apiKeys = signal<ApiKey[]>([]);
  protected readonly objects = signal<StorageObject[]>([]);
  protected readonly selectedProjectId = signal('');
  protected readonly selectedBucketId = signal('');
  protected readonly selectedApiKeyId = signal('');
  protected readonly selectedFile = signal<File | null>(null);
  protected readonly prefix = signal('');
  protected readonly isLoading = signal(false);
  protected readonly isSubmitting = signal(false);
  protected readonly uploadProgress = signal<number | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly formRevision = signal(0);

  // Preview state
  protected readonly previewObject = signal<StorageObject | null>(null);
  protected readonly previewUrl = signal<string | null>(null);
  protected readonly previewText = signal<string | null>(null);
  protected readonly isPreviewLoading = signal(false);

  protected readonly activeApiKeys = computed(() => this.apiKeys().filter((apiKey) => !apiKey.revokedAt));
  protected readonly selectedBucket = computed(() => this.buckets().find((bucket) => bucket.id === this.selectedBucketId()));

  protected readonly selectedBucketConnection = computed(() => {
    const bucket = this.selectedBucket();
    if (!bucket || !bucket.providerIntegrationId) return null;
    return this.connections().find((c) => c.id === bucket.providerIntegrationId) ?? null;
  });

  protected readonly isConnectionPendingConfirmation = computed(() => {
    return this.selectedBucketConnection()?.sid3RootFolderStatus === 'PENDING_CONFIRMATION';
  });

  protected readonly canListObjects = computed(() => {
    this.formRevision();
    return Boolean(this.selectedBucketId() && this.form.controls.apiKeySecret.valid);
  });
  protected readonly canUploadObject = computed(() => {
    this.formRevision();
    return Boolean(this.canListObjects() && this.form.valid && this.selectedFile() && !this.isConnectionPendingConfirmation());
  });
  protected readonly uploadRequirements = computed(() => {
    this.formRevision();
    const requirements: string[] = [];

    if (!this.selectedBucketId()) {
      requirements.push('Selecione um bucket.');
    }

    if (this.isConnectionPendingConfirmation()) {
      requirements.push('Confirmação de pasta raiz pendente na conexão deste bucket.');
    }

    if (this.activeApiKeys().length === 0) {
      requirements.push('Selecione uma chave de API ativa.');
    }

    if (this.form.controls.apiKeySecret.invalid) {
      requirements.push('Cole o segredo da chave.');
    }

    if (this.form.controls.key.invalid) {
      requirements.push('Informe o caminho do arquivo.');
    }

    if (!this.selectedFile()) {
      requirements.push('Escolha um arquivo.');
    }

    return requirements;
  });
  protected readonly form = this.formBuilder.nonNullable.group({
    apiKeySecret: ['', [Validators.required]],
    key: ['', [Validators.required, Validators.minLength(1)]]
  });

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.formRevision.update((revision) => revision + 1);
    });
    this.loadProjects();
  }

  selectProject(event: Event): void {
    const projectId = (event.target as HTMLSelectElement).value;
    this.selectedProjectId.set(projectId);
    this.loadProjectDependencies(projectId);
  }

  selectBucket(event: Event): void {
    this.selectedBucketId.set((event.target as HTMLSelectElement).value);
    this.objects.set([]);
  }

  selectApiKey(event: Event): void {
    this.selectedApiKeyId.set((event.target as HTMLSelectElement).value);
  }

  selectFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile.set(input.files?.[0] ?? null);
  }

  loadObjects(): void {
    const bucketId = this.selectedBucketId();
    const apiKeySecret = this.form.controls.apiKeySecret.value;
    if (!bucketId || !apiKeySecret) {
      return;
    }

    this.errorMessage.set(null);
    this.isLoading.set(true);
    this.objectsService
      .listObjects(bucketId, apiKeySecret, this.prefix())
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (response) => this.objects.set(response.items),
        error: (error: unknown) => {
          const msg = toApiErrorMessage(error);
          this.errorMessage.set(msg);
          this.notificationService.error(msg);
        }
      });
  }

  uploadObject(): void {
    const bucketId = this.selectedBucketId();
    const file = this.selectedFile();
    if (!bucketId || !file || this.form.invalid || this.isSubmitting() || this.isConnectionPendingConfirmation()) {
      return;
    }

    this.errorMessage.set(null);
    this.isSubmitting.set(true);
    this.uploadProgress.set(0);

    this.objectsService
      .uploadObjectWithProgress(bucketId, this.form.controls.apiKeySecret.value, this.form.controls.key.value, file)
      .pipe(
        finalize(() => {
          this.isSubmitting.set(false);
          this.uploadProgress.set(null);
        })
      )
      .subscribe({
        next: (event) => {
          if (event.type === HttpEventType.UploadProgress && event.total) {
            this.uploadProgress.set(Math.round((100 * event.loaded) / event.total));
          } else if (event.type === HttpEventType.Response && event.body) {
            const object = event.body;
            this.objects.update((objects) => [object, ...objects]);
            this.form.controls.key.reset();
            this.selectedFile.set(null);
            this.notificationService.success(`Arquivo "${object.fileName}" enviado com sucesso!`);
          }
        },
        error: (error: unknown) => {
          const msg = toApiErrorMessage(error);
          this.errorMessage.set(msg);
          this.notificationService.error(msg);
        }
      });
  }

  download(object: StorageObject): void {
    const bucketId = this.selectedBucketId();
    const apiKeySecret = this.form.controls.apiKeySecret.value;
    if (!bucketId || !apiKeySecret) {
      return;
    }

    this.objectsService.downloadObject(bucketId, object.id, apiKeySecret).subscribe({
      next: (response) => {
        const blob = response.body;
        if (!blob) {
          return;
        }
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = object.fileName;
        anchor.click();
        URL.revokeObjectURL(url);
      },
      error: (error: unknown) => {
        const msg = toApiErrorMessage(error);
        this.errorMessage.set(msg);
        this.notificationService.error(msg);
      }
    });
  }

  copySignedUrl(object: StorageObject): void {
    const bucketId = this.selectedBucketId();
    const apiKeySecret = this.form.controls.apiKeySecret.value;
    if (!bucketId || !apiKeySecret) {
      return;
    }

    this.objectsService.signDownloadUrl(bucketId, object.id, apiKeySecret, 900).subscribe({
      next: (res) => {
        const fullUrl = `${window.location.origin}/api/v1${res.url}`;
        void navigator.clipboard.writeText(fullUrl);
        this.notificationService.success('URL assinada copiada! Link direto válido por 15 minutos.');
      },
      error: (error: unknown) => {
        this.notificationService.error(toApiErrorMessage(error));
      }
    });
  }

  deleteObject(object: StorageObject): void {
    const bucketId = this.selectedBucketId();
    const apiKeySecret = this.form.controls.apiKeySecret.value;
    if (!bucketId || !apiKeySecret) {
      return;
    }

    this.objectsService.deleteObject(bucketId, object.id, apiKeySecret).subscribe({
      next: () => {
        this.objects.update((objects) => objects.filter((item) => item.id !== object.id));
        this.notificationService.success(`Arquivo "${object.fileName}" excluído com sucesso!`);
      },
      error: (error: unknown) => {
        const msg = toApiErrorMessage(error);
        this.errorMessage.set(msg);
        this.notificationService.error(msg);
      }
    });
  }

  // Preview methods
  protected isPreviewable(object: StorageObject): boolean {
    const type = object.contentType?.toLowerCase() ?? '';
    return type.startsWith('image/') || type === 'application/pdf' || type.startsWith('text/') || type.includes('json');
  }

  protected isImage(object: StorageObject): boolean {
    return object.contentType?.toLowerCase().startsWith('image/') ?? false;
  }

  protected isPdf(object: StorageObject): boolean {
    return object.contentType?.toLowerCase() === 'application/pdf';
  }

  protected openPreview(object: StorageObject): void {
    const bucketId = this.selectedBucketId();
    const apiKeySecret = this.form.controls.apiKeySecret.value;
    if (!bucketId || !apiKeySecret) return;

    this.closePreview();
    this.previewObject.set(object);
    this.isPreviewLoading.set(true);

    this.objectsService.downloadObject(bucketId, object.id, apiKeySecret).subscribe({
      next: (response) => {
        this.isPreviewLoading.set(false);
        const blob = response.body;
        if (!blob) return;

        const type = object.contentType?.toLowerCase() ?? '';
        if (type.startsWith('text/') || type.includes('json')) {
          void blob.text().then((text) => this.previewText.set(text));
        } else {
          const url = URL.createObjectURL(blob);
          this.previewUrl.set(url);
        }
      },
      error: (error: unknown) => {
        this.isPreviewLoading.set(false);
        this.notificationService.error(toApiErrorMessage(error));
        this.closePreview();
      }
    });
  }

  protected closePreview(): void {
    const url = this.previewUrl();
    if (url) {
      URL.revokeObjectURL(url);
    }
    this.previewObject.set(null);
    this.previewUrl.set(null);
    this.previewText.set(null);
    this.isPreviewLoading.set(false);
  }

  protected formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  protected objectStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      AVAILABLE: 'Disponível',
      PENDING: 'Pendente',
      DELETING: 'Excluindo',
      DELETED: 'Excluído',
      FAILED: 'Falhou'
    };
    return labels[status] ?? status;
  }

  protected objectStatusClass(status: string): string {
    if (status === 'AVAILABLE') return 'connected';
    if (status === 'FAILED' || status === 'DELETED') return 'revoked';
    return 'error';
  }

  private loadProjects(): void {
    this.projectsService.listProjects().subscribe({
      next: (projects) => {
        this.projects.set(projects);
        const firstProject = projects[0];
        if (firstProject) {
          this.selectedProjectId.set(firstProject.id);
          this.loadProjectDependencies(firstProject.id);
        }
      },
      error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
    });

    this.connectionsService.listConnections().subscribe({
      next: (connections) => this.connections.set(connections),
      error: () => undefined
    });
  }

  private loadProjectDependencies(projectId: string): void {
    this.objects.set([]);
    this.bucketsService.listBuckets(projectId).subscribe({
      next: (buckets) => {
        this.buckets.set(buckets);
        this.selectedBucketId.set(buckets[0]?.id ?? '');
      },
      error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
    });
    this.apiKeysService.listApiKeys(projectId).subscribe({
      next: (apiKeys) => {
        this.apiKeys.set(apiKeys);
        this.selectedApiKeyId.set(apiKeys.find((apiKey) => !apiKey.revokedAt)?.id ?? '');
      },
      error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
    });
  }
}
