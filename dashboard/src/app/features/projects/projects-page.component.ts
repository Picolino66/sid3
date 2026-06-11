import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { toApiErrorMessage } from '../../core/api/api-error';
import { Project } from './project.models';
import { ProjectsService } from './projects.service';

@Component({
  selector: 'sid3-projects-page',
  imports: [DatePipe, ReactiveFormsModule],
  template: `
    <header class="topbar">
      <div>
        <p class="eyebrow">Espaço de trabalho</p>
        <h1>Projetos</h1>
      </div>
    </header>

    <section class="status-grid" aria-label="Status de configuração">
      <article>
        <span class="ready">pronto</span>
        <strong>Identidade</strong>
      </article>
      <article>
        <span class="ready">pronto</span>
        <strong>Projetos</strong>
      </article>
      <article>
        <span>próximo</span>
        <strong>Conexões</strong>
      </article>
      <article>
        <span>próximo</span>
        <strong>Primeiro upload</strong>
      </article>
    </section>

    <section class="split-layout">
      <form class="panel" [formGroup]="form" (ngSubmit)="createProject()">
        <header>
          <h2>Criar projeto</h2>
          <p>Projetos isolam chaves de API, buckets, conexões e objetos.</p>
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
          <p>Somente projetos do usuário autenticado são exibidos.</p>
        </header>

        @if (isLoading()) {
          <p class="muted">Carregando projetos...</p>
        } @else if (projects().length === 0) {
          <p class="empty-state">Nenhum projeto ainda.</p>
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
