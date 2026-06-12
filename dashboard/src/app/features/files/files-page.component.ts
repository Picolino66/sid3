import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { toApiErrorMessage } from '../../core/api/api-error';
import { ApiKey } from '../api-keys/api-key.models';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { Bucket } from '../buckets/bucket.models';
import { BucketsService } from '../buckets/buckets.service';
import { Project } from '../projects/project.models';
import { ProjectsService } from '../projects/projects.service';
import { ObjectsService } from './objects.service';
import { StorageObject } from './storage-object.models';

@Component({
  selector: 'sid3-files-page',
  imports: [DatePipe, ReactiveFormsModule],
  template: `
    <header class="topbar">
      <div>
        <h1>Arquivos</h1>
      </div>
      <button type="button" [disabled]="!canListObjects() || isLoading()" (click)="loadObjects()">
        {{ isLoading() ? 'Carregando...' : 'Atualizar' }}
      </button>
    </header>

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
                  <button class="compact-button" type="button" (click)="download(object)">Baixar</button>
                  <button class="danger compact-button" type="button" (click)="deleteObject(object)">Excluir</button>
                </span>
              </div>
            }
          </div>
        }
      </section>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FilesPageComponent {
  private readonly projectsService = inject(ProjectsService);
  private readonly bucketsService = inject(BucketsService);
  private readonly apiKeysService = inject(ApiKeysService);
  private readonly objectsService = inject(ObjectsService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly projects = signal<Project[]>([]);
  protected readonly buckets = signal<Bucket[]>([]);
  protected readonly apiKeys = signal<ApiKey[]>([]);
  protected readonly objects = signal<StorageObject[]>([]);
  protected readonly selectedProjectId = signal('');
  protected readonly selectedBucketId = signal('');
  protected readonly selectedApiKeyId = signal('');
  protected readonly selectedFile = signal<File | null>(null);
  protected readonly prefix = signal('');
  protected readonly isLoading = signal(false);
  protected readonly isSubmitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly formRevision = signal(0);
  protected readonly activeApiKeys = computed(() => this.apiKeys().filter((apiKey) => !apiKey.revokedAt));
  protected readonly selectedBucket = computed(() => this.buckets().find((bucket) => bucket.id === this.selectedBucketId()));
  protected readonly canListObjects = computed(() => {
    this.formRevision();
    return Boolean(this.selectedBucketId() && this.form.controls.apiKeySecret.valid);
  });
  protected readonly canUploadObject = computed(() => {
    this.formRevision();
    return Boolean(this.canListObjects() && this.form.valid && this.selectedFile());
  });
  protected readonly uploadRequirements = computed(() => {
    this.formRevision();
    const requirements: string[] = [];

    if (!this.selectedBucketId()) {
      requirements.push('Selecione um bucket.');
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
        error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
      });
  }

  uploadObject(): void {
    const bucketId = this.selectedBucketId();
    const file = this.selectedFile();
    if (!bucketId || !file || this.form.invalid || this.isSubmitting()) {
      return;
    }

    this.errorMessage.set(null);
    this.isSubmitting.set(true);
    this.objectsService
      .uploadObject(bucketId, this.form.controls.apiKeySecret.value, this.form.controls.key.value, file)
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: (object) => {
          this.objects.update((objects) => [object, ...objects]);
          this.form.controls.key.reset();
          this.selectedFile.set(null);
        },
        error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
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
      error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
    });
  }

  deleteObject(object: StorageObject): void {
    const bucketId = this.selectedBucketId();
    const apiKeySecret = this.form.controls.apiKeySecret.value;
    if (!bucketId || !apiKeySecret) {
      return;
    }

    this.objectsService.deleteObject(bucketId, object.id, apiKeySecret).subscribe({
      next: () => this.objects.update((objects) => objects.filter((item) => item.id !== object.id)),
      error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
    });
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
