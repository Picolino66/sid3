import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { toApiErrorMessage } from '../../core/api/api-error';
import { Project } from './project.models';
import { ProjectsService } from './projects.service';

@Component({
  selector: 'sid3-projects-page',
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  template: `
    <header class="topbar">
      <div>
        <h1>Projetos</h1>
      </div>
    </header>

    <section class="split-layout">
      <form class="panel" [formGroup]="form" (ngSubmit)="createProject()">
        <header>
          <h2>Criar projeto</h2>
        </header>
        <label>
          Nome
          <input type="text" formControlName="name" placeholder="Armazenamento de Imagens" />
        </label>

        @if (errorMessage()) {
          <p class="form-error">{{ errorMessage() }}</p>
        }

        <button type="submit" [disabled]="form.invalid || isSubmitting()">
          {{ isSubmitting() ? 'Criando...' : 'Criar projeto' }}
        </button>
      </form>

      <section class="panel">
        <header>
          <h2>Seus projetos</h2>
        </header>

        @if (isLoading()) {
          <p class="muted">Carregando projetos...</p>
        } @else if (projects().length === 0) {
          <div class="empty-cta">
            <strong>Bem-vindo ao SID3</strong>
            <p class="muted">Crie seu primeiro projeto para começar a usar o gateway de armazenamento.</p>
          </div>
        } @else {
          <div class="table" role="table" aria-label="Projetos">
            <div role="row" class="head">
              <span role="columnheader">Nome</span>
              <span role="columnheader">Slug</span>
              <span role="columnheader">Criado em</span>
            </div>
            @for (project of projects(); track project.id) {
              <div role="row">
                <span role="cell">{{ project.name }}</span>
                <span role="cell">{{ project.slug }}</span>
                <span role="cell">{{ project.createdAt | date: 'short' }}</span>
              </div>
            }
          </div>
        }
      </section>
    </section>

    @if (!isLoading() && projects().length > 0) {
      <section class="setup-guide panel">
        <h2>Próximos passos</h2>
        <p class="muted">Siga essa sequência para começar a enviar arquivos.</p>
        <ol class="setup-steps">
          <li class="step done">
            <span class="step-check">✓</span>
            <span>Projeto criado</span>
          </li>
          <li class="step">
            <span class="step-number">2</span>
            <span>Conecte uma conta Google Drive</span>
            <a routerLink="/connections" class="step-link">Ir para Conexões</a>
          </li>
          <li class="step">
            <span class="step-number">3</span>
            <span>Crie um bucket de armazenamento</span>
            <a routerLink="/buckets" class="step-link">Ir para Buckets</a>
          </li>
          <li class="step">
            <span class="step-number">4</span>
            <span>Gere uma chave de API</span>
            <a routerLink="/api-keys" class="step-link">Ir para Chaves de API</a>
          </li>
          <li class="step">
            <span class="step-number">5</span>
            <span>Faça o primeiro upload</span>
            <a routerLink="/files" class="step-link">Ir para Arquivos</a>
          </li>
        </ol>
      </section>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectsPageComponent {
  private readonly projectsService = inject(ProjectsService);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly projects = signal<Project[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly isSubmitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]]
  });

  constructor() {
    this.loadProjects();
  }

  createProject(): void {
    if (this.form.invalid || this.isSubmitting()) {
      return;
    }

    this.errorMessage.set(null);
    this.isSubmitting.set(true);
    this.projectsService
      .createProject(this.form.getRawValue())
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: (project) => {
          this.projects.update((projects) => [...projects, project]);
          this.form.reset();
        },
        error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
      });
  }

  private loadProjects(): void {
    this.isLoading.set(true);
    this.projectsService
      .listProjects()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (projects) => this.projects.set(projects),
        error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
      });
  }
}
