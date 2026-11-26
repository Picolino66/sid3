import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { toApiErrorMessage } from '../../core/api/api-error';
import { ProjectContextService } from '../../core/project-context/project-context.service';
import { Project } from './project.models';
import { ProjectsService } from './projects.service';

/** Gestão de projetos. Cada projeto escolhe suas contas do Drive em Armazenamento. */
@Component({
  selector: 'sid3-projects-page',
  imports: [DatePipe, ReactiveFormsModule],
  template: `
    <header class="topbar">
      <div>
        <h1>Projetos</h1>
        <p class="muted">
          Projetos e contas do Google Drive são independentes: crie quantos projetos quiser e escolha, em cada um,
          quais contas ele usa.
        </p>
      </div>
    </header>

    @if (errorMessage()) {
      <p class="form-error">{{ errorMessage() }}</p>
    }

    <section class="panel">
      <form class="inline-form" [formGroup]="form" (ngSubmit)="createProject()">
        <input formControlName="name" placeholder="Nome do novo projeto (ex.: Fotos da família)" aria-label="Nome do novo projeto" />
        <button type="submit" [disabled]="form.invalid || isSubmitting()">
          {{ isSubmitting() ? 'Criando...' : 'Criar projeto' }}
        </button>
      </form>
    </section>

    <section class="panel">
      @if (projectContext.isLoading() && projectContext.projects().length === 0) {
        <p class="muted">Carregando projetos...</p>
      } @else if (projectContext.projects().length === 0) {
        <p class="empty-state">Nenhum projeto ainda. Crie o primeiro acima.</p>
      } @else {
        <ul class="row-list">
          @for (project of projectContext.projects(); track project.id) {
            <li class="row-item" [class.row-current]="project.id === projectContext.currentProjectId()">
              <div class="row-main">
                @if (renamingId() === project.id) {
                  <input
                    class="inline-edit"
                    [value]="project.name"
                    aria-label="Novo nome do projeto"
                    (keydown.enter)="rename(project, $any($event.target).value)"
                    (keydown.escape)="renamingId.set(null)"
                    (blur)="rename(project, $any($event.target).value)"
                  />
                } @else {
                  <strong>{{ project.name }}</strong>
                }
                <span class="muted">
                  {{ project.connectionCount }} conta(s) do Drive · {{ project.bucketCount }} bucket(s) · criado em
                  {{ project.createdAt | date: 'dd/MM/yyyy' }}
                </span>
              </div>
              <div class="row-actions">
                @if (project.id === projectContext.currentProjectId()) {
                  <span class="status-label connected">Atual</span>
                }
                <button type="button" class="compact-button" (click)="open(project)">Abrir</button>
                <button type="button" class="secondary compact-button" (click)="renamingId.set(project.id)">Renomear</button>
                <button type="button" class="danger compact-button" (click)="remove(project)">Excluir</button>
              </div>
            </li>
          }
        </ul>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectsPageComponent {
  protected readonly projectContext = inject(ProjectContextService);
  private readonly projectsService = inject(ProjectsService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);

  protected readonly renamingId = signal<string | null>(null);
  protected readonly isSubmitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]]
  });

  constructor() {
    this.projectContext.refresh().subscribe({ error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error)) });
  }

  createProject(): void {
    if (this.form.invalid) return;
    this.isSubmitting.set(true);
    this.errorMessage.set(null);
    this.projectsService
      .createProject({ name: this.form.getRawValue().name.trim() })
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: (project) => {
          this.form.reset();
          this.projectContext.upsert(project);
          this.projectContext.select(project.id);
          void this.router.navigateByUrl('/storage');
        },
        error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
      });
  }

  open(project: Project): void {
    this.projectContext.select(project.id);
    void this.router.navigateByUrl('/overview');
  }

  rename(project: Project, rawName: string): void {
    this.renamingId.set(null);
    const name = rawName.trim();
    if (!name || name === project.name) return;
    this.projectsService.updateProject(project.id, { name }).subscribe({
      next: (updated) => this.projectContext.upsert(updated),
      error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
    });
  }

  remove(project: Project): void {
    const confirmed = window.confirm(
      `Excluir o projeto "${project.name}"? Buckets vazios, chaves de API e pools dele serão apagados. As contas do Drive continuam em Conexões.`
    );
    if (!confirmed) return;
    this.projectsService.deleteProject(project.id).subscribe({
      next: () => this.projectContext.remove(project.id),
      error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
    });
  }
}
