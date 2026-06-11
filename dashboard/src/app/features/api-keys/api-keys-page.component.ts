import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { toApiErrorMessage } from '../../core/api/api-error';
import { Project } from '../projects/project.models';
import { ProjectsService } from '../projects/projects.service';
import { ApiKey } from './api-key.models';
import { ApiKeysService } from './api-keys.service';

@Component({
  selector: 'sid3-api-keys-page',
  imports: [DatePipe, ReactiveFormsModule],
  template: `
    <header class="topbar">
      <div>
        <p class="eyebrow">Credenciais</p>
        <h1>Chaves de API</h1>
      </div>
    </header>

    <section class="split-layout">
      <form class="panel" [formGroup]="form" (ngSubmit)="createApiKey()">
        <header>
          <h2>Criar chave de API</h2>
          <p>Os segredos são exibidos uma vez e armazenados apenas como hashes pela API.</p>
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
          Nome
          <input type="text" formControlName="name" placeholder="Integração de produção" />
        </label>

        @if (createdSecret()) {
          <div class="secret-box">
            <span>Novo segredo</span>
            <code>{{ createdSecret() }}</code>
          </div>
        }

        @if (errorMessage()) {
          <p class="form-error">{{ errorMessage() }}</p>
        }

        <button type="submit" [disabled]="form.invalid || isSubmitting() || !selectedProjectId()">
          {{ isSubmitting() ? 'Criando...' : 'Criar chave de API' }}
        </button>
      </form>

      <section class="panel">
        <header>
          <h2>{{ selectedProject()?.name ?? 'Chaves de API do projeto' }}</h2>
          <p>Clientes externos usam essas credenciais para acessar os endpoints de objetos.</p>
        </header>

        @if (isLoading()) {
          <p class="muted">Carregando chaves de API...</p>
        } @else if (apiKeys().length === 0) {
          <p class="empty-state">Nenhuma chave de API para este projeto.</p>
        } @else {
          <div class="table api-key-table" role="table" aria-label="Chaves de API">
            <div role="row" class="head">
              <span role="columnheader">Nome</span>
              <span role="columnheader">Prefixo</span>
              <span role="columnheader">Último uso</span>
              <span role="columnheader">Estado</span>
              <span role="columnheader">Ação</span>
            </div>
            @for (apiKey of apiKeys(); track apiKey.id) {
              <div role="row">
                <span role="cell">{{ apiKey.name }}</span>
                <span role="cell">{{ apiKey.prefix }}</span>
                <span role="cell">{{ apiKey.lastUsedAt ? (apiKey.lastUsedAt | date: 'short') : 'Nunca' }}</span>
                <span role="cell"><span class="badge">{{ apiKey.revokedAt ? 'REVOGADA' : 'ATIVA' }}</span></span>
                <span role="cell">
                  <button
                    class="secondary compact-button"
                    type="button"
                    [disabled]="Boolean(apiKey.revokedAt)"
                    (click)="revoke(apiKey)"
                  >
                    Revogar
                  </button>
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
export class ApiKeysPageComponent {
  private readonly projectsService = inject(ProjectsService);
  private readonly apiKeysService = inject(ApiKeysService);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly projects = signal<Project[]>([]);
  protected readonly apiKeys = signal<ApiKey[]>([]);
  protected readonly selectedProjectId = signal<string>('');
  protected readonly selectedProject = computed(() => this.projects().find((project) => project.id === this.selectedProjectId()));
  protected readonly createdSecret = signal<string | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly isSubmitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly Boolean = Boolean;
  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]]
  });

  constructor() {
    this.loadProjects();
  }

  selectProject(event: Event): void {
    const projectId = (event.target as HTMLSelectElement).value;
    this.selectedProjectId.set(projectId);
    this.loadApiKeys(projectId);
  }

  createApiKey(): void {
    const projectId = this.selectedProjectId();
    if (!projectId || this.form.invalid || this.isSubmitting()) {
      return;
    }

    this.errorMessage.set(null);
    this.createdSecret.set(null);
    this.isSubmitting.set(true);
    this.apiKeysService
      .createApiKey(projectId, this.form.getRawValue())
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: (created) => {
          this.apiKeys.update((apiKeys) => [...apiKeys, created.apiKey]);
          this.createdSecret.set(created.secret);
          this.form.reset();
        },
        error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
      });
  }

  revoke(apiKey: ApiKey): void {
    const projectId = this.selectedProjectId();
    if (!projectId) {
      return;
    }

    this.apiKeysService.revokeApiKey(projectId, apiKey.id).subscribe({
      next: () => {
        this.apiKeys.update((apiKeys) =>
          apiKeys.map((item) => (item.id === apiKey.id ? { ...item, revokedAt: new Date().toISOString() } : item))
        );
      },
      error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
    });
  }

  private loadProjects(): void {
    this.projectsService.listProjects().subscribe({
      next: (projects) => {
        this.projects.set(projects);
        const firstProject = projects[0];
        if (firstProject) {
          this.selectedProjectId.set(firstProject.id);
          this.loadApiKeys(firstProject.id);
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

  private loadApiKeys(projectId: string): void {
    this.isLoading.set(true);
    this.apiKeysService
      .listApiKeys(projectId)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (apiKeys) => this.apiKeys.set(apiKeys),
        error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
      });
  }
}
