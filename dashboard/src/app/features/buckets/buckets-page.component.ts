import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { toApiErrorMessage } from '../../core/api/api-error';
import { Connection } from '../connections/connection.models';
import { ConnectionsService } from '../connections/connections.service';
import { Project } from '../projects/project.models';
import { ProjectsService } from '../projects/projects.service';
import { StoragePool } from '../storage-pools/storage-pool.models';
import { StoragePoolsService } from '../storage-pools/storage-pools.service';
import { Bucket } from './bucket.models';
import { BucketsService } from './buckets.service';

@Component({
  selector: 'sid3-buckets-page',
  imports: [DatePipe, ReactiveFormsModule],
  template: `
    <header class="topbar">
      <div>
        <p class="eyebrow">Armazenamento</p>
        <h1>Buckets</h1>
      </div>
    </header>

    <section class="split-layout">
      <form class="panel" [formGroup]="form" (ngSubmit)="createBucket()">
        <header>
          <h2>Criar bucket</h2>
          <p>Buckets mapeiam namespaces de objetos SID3 para uma conexão ou pool de armazenamento.</p>
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
          Tipo de armazenamento
          <select formControlName="storageType">
            <option value="connection">Conexão direta</option>
            <option value="pool">Pool de armazenamento</option>
          </select>
        </label>

        @if (form.controls.storageType.value === 'connection') {
          <label>
            Conexão
            <select formControlName="providerIntegrationId">
              @for (conn of connectedIntegrations(); track conn.id) {
                <option [value]="conn.id">{{ conn.displayName ?? conn.provider }} ({{ conn.status }})</option>
              }
            </select>
          </label>
        } @else {
          <label>
            Pool de armazenamento
            <select formControlName="storagePoolId">
              @for (pool of storagePools(); track pool.id) {
                <option [value]="pool.id">{{ pool.name }} ({{ pool.strategy }}, {{ pool.members.length }} drives)</option>
              }
            </select>
          </label>
        }

        <label>
          Nome do bucket
          <input type="text" formControlName="name" placeholder="avatares" />
        </label>

        @if (errorMessage()) {
          <p class="form-error">{{ errorMessage() }}</p>
        }

        <button
          type="submit"
          [disabled]="form.invalid || isSubmitting() || !selectedProjectId()"
        >
          {{ isSubmitting() ? 'Criando...' : 'Criar bucket' }}
        </button>
      </form>

      <section class="panel">
        <header>
          <h2>{{ selectedProject()?.name ?? 'Buckets do projeto' }}</h2>
          <p>Somente buckets do projeto selecionado são exibidos.</p>
        </header>

        @if (isLoading()) {
          <p class="muted">Carregando buckets...</p>
        } @else if (buckets().length === 0) {
          <p class="empty-state">Nenhum bucket para este projeto.</p>
        } @else {
          <div class="table bucket-table" role="table" aria-label="Buckets">
            <div role="row" class="head">
              <span role="columnheader">Nome</span>
              <span role="columnheader">Armazenamento</span>
              <span role="columnheader">Criado em</span>
            </div>
            @for (bucket of buckets(); track bucket.id) {
              <div role="row">
                <span role="cell">{{ bucket.name }}</span>
                <span role="cell">
                  @if (bucket.storagePoolId) {
                    <span class="badge">Pool: {{ bucket.storagePoolId }}</span>
                  } @else {
                    {{ bucket.providerIntegrationId }}
                  }
                </span>
                <span role="cell">{{ bucket.createdAt | date: 'short' }}</span>
              </div>
            }
          </div>
        }
      </section>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BucketsPageComponent {
  private readonly projectsService = inject(ProjectsService);
  private readonly connectionsService = inject(ConnectionsService);
  private readonly storagePoolsService = inject(StoragePoolsService);
  private readonly bucketsService = inject(BucketsService);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly projects = signal<Project[]>([]);
  protected readonly connections = signal<Connection[]>([]);
  protected readonly storagePools = signal<StoragePool[]>([]);
  protected readonly buckets = signal<Bucket[]>([]);
  protected readonly selectedProjectId = signal<string>('');
  protected readonly selectedProject = computed(() =>
    this.projects().find((project) => project.id === this.selectedProjectId())
  );
  protected readonly connectedIntegrations = computed(() =>
    this.connections().filter((c) => c.status === 'CONNECTED')
  );
  protected readonly isLoading = signal(true);
  protected readonly isSubmitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.pattern(/^[a-z0-9][a-z0-9-]{2,62}$/)]],
    storageType: ['connection'],
    providerIntegrationId: [''],
    storagePoolId: ['']
  });

  constructor() {
    this.loadInitialData();
  }

  selectProject(event: Event): void {
    const projectId = (event.target as HTMLSelectElement).value;
    this.selectedProjectId.set(projectId);
    this.loadBuckets(projectId);
    this.loadPools(projectId);
  }

  createBucket(): void {
    const projectId = this.selectedProjectId();
    if (!projectId || this.form.invalid || this.isSubmitting()) {
      return;
    }

    const { name, storageType, providerIntegrationId, storagePoolId } = this.form.getRawValue();
    const request =
      storageType === 'pool'
        ? { name, storagePoolId: storagePoolId || undefined }
        : { name, providerIntegrationId: providerIntegrationId || undefined };

    this.errorMessage.set(null);
    this.isSubmitting.set(true);
    this.bucketsService
      .createBucket(projectId, request)
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: (bucket) => {
          this.buckets.update((buckets) => [...buckets, bucket]);
          this.form.controls.name.reset();
        },
        error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
      });
  }

  private loadInitialData(): void {
    this.connectionsService.listConnections().subscribe({
      next: (connections) => {
        this.connections.set(connections);
        const firstConnected = connections.find((c) => c.status === 'CONNECTED');
        if (firstConnected) {
          this.form.controls.providerIntegrationId.setValue(firstConnected.id);
        }
      },
      error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
    });

    this.projectsService.listProjects().subscribe({
      next: (projects) => {
        this.projects.set(projects);
        const firstProject = projects.at(0);
        if (firstProject) {
          this.selectedProjectId.set(firstProject.id);
          this.loadBuckets(firstProject.id);
          this.loadPools(firstProject.id);
        } else {
          this.isLoading.set(false);
        }
      },
      error: (error: unknown) => {
        this.isLoading.set(false);
        this.errorMessage.set(toApiErrorMessage(error));
      }
    });
  }

  private loadBuckets(projectId: string): void {
    this.isLoading.set(true);
    this.bucketsService
      .listBuckets(projectId)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (buckets) => this.buckets.set(buckets),
        error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
      });
  }

  private loadPools(projectId: string): void {
    this.storagePoolsService.listPools(projectId).subscribe({
      next: (pools) => {
        this.storagePools.set(pools);
        const firstPool = pools.at(0);
        if (firstPool) {
          this.form.controls.storagePoolId.setValue(firstPool.id);
        }
      },
      error: () => {}
    });
  }
}
