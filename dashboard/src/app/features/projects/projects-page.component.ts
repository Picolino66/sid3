import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { toApiErrorDetails, toApiErrorMessage } from '../../core/api/api-error';
import { NotificationService } from '../../core/notifications/notification.service';
import { ProjectContextService } from '../../core/project-context/project-context.service';
import { ConfirmService } from '../../shared/ui/confirm.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { ErrorStateComponent } from '../../shared/ui/error-state.component';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { initials, plural } from '../../shared/ui/format';
import { IconComponent } from '../../shared/ui/icon.component';
import { MenuComponent } from '../../shared/ui/menu.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { SkeletonComponent } from '../../shared/ui/skeleton.component';
import { matchesQuery } from '../../shared/ui/table-sort';
import { Project } from './project.models';
import { ProjectsService } from './projects.service';

/** Gestão de projetos. Cada projeto escolhe suas contas do Drive em Armazenamento. */
@Component({
  selector: 'sid3-projects-page',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    EmptyStateComponent,
    ErrorStateComponent,
    FieldErrorComponent,
    IconComponent,
    MenuComponent,
    ModalComponent,
    PageHeaderComponent,
    SkeletonComponent
  ],
  template: `
    <sid3-page-header
      title="Projetos"
      description="Crie quantos projetos quiser e escolha, em cada um, quais contas do Google Drive ele usa."
    >
      <button class="btn btn--primary" type="button" (click)="openCreate()"><sid3-icon name="plus" />Novo projeto</button>
    </sid3-page-header>

    <section class="card">
      @if (projectContext.isLoading() && projectContext.projects().length === 0) {
        <sid3-skeleton [count]="3" label="Carregando projetos" />
      } @else if (loadError(); as failure) {
        <sid3-error-state
          title="Não foi possível carregar os projetos"
          [message]="failure.message"
          [details]="failure.details"
          [busy]="projectContext.isLoading()"
          (retry)="reload()"
        />
      } @else if (projectContext.projects().length === 0) {
        <sid3-empty-state
          icon="layers"
          title="Crie seu primeiro projeto"
          description="Projetos agrupam buckets, chaves de API e as contas do Drive que cada um usa."
        >
          <button class="btn btn--primary" type="button" (click)="openCreate()"><sid3-icon name="plus" />Novo projeto</button>
        </sid3-empty-state>
      } @else {
        @if (projectContext.projects().length > 5) {
          <div class="toolbar">
            <label class="input-icon toolbar__search">
              <span class="sr-only">Buscar projeto</span>
              <sid3-icon name="search" />
              <input class="input input--sm" type="search" placeholder="Buscar projeto" [value]="query()" (input)="query.set($any($event.target).value)" />
            </label>
          </div>
        }
        <ul class="row-list">
          @for (project of visibleProjects(); track project.id) {
            <li class="row-item" [class.row-item--current]="project.id === projectContext.currentProjectId()">
              <span class="row-item__avatar" aria-hidden="true">{{ initials(project.name) }}</span>
              <div class="row-item__main">
                <strong class="truncate">{{ project.name }}</strong>
                <span class="row-item__meta">
                  {{ plural(project.connectionCount, 'conta do Drive', 'contas do Drive') }} · {{ plural(project.bucketCount, 'bucket', 'buckets') }} ·
                  criado em {{ project.createdAt | date: 'dd/MM/yyyy' }}
                </span>
              </div>
              <div class="row-item__aside">
                @if (project.id === projectContext.currentProjectId()) {
                  <span class="chip chip--accent">Atual</span>
                } @else {
                  <button type="button" class="btn btn--sm" (click)="open(project)">Abrir</button>
                }
                <sid3-menu [label]="'Ações do projeto ' + project.name">
                  <button class="menu-item" type="button" role="menuitem" (click)="openRename(project)"><sid3-icon name="pencil" />Renomear</button>
                  <hr class="menu-sep" />
                  <button class="menu-item menu-item--danger" type="button" role="menuitem" (click)="remove(project)"><sid3-icon name="trash" />Excluir projeto</button>
                </sid3-menu>
              </div>
            </li>
          } @empty {
            <li>
              <sid3-empty-state icon="search" title="Nenhum projeto encontrado" [compact]="true">
                <button class="btn btn--sm" type="button" (click)="query.set('')">Limpar busca</button>
              </sid3-empty-state>
            </li>
          }
        </ul>
      }
    </section>

    @if (dialog(); as mode) {
      <sid3-modal [title]="mode === 'create' ? 'Novo projeto' : 'Renomear projeto'" [dismissable]="!isSubmitting()" (closed)="closeDialog()">
        <form id="project-form" class="field" [formGroup]="form" (ngSubmit)="submitDialog()">
          <label class="field__label" for="project-name">Nome do projeto<span class="field__req" aria-hidden="true">*</span></label>
          <input id="project-name" class="input" formControlName="name" placeholder="Ex.: Fotos da família" data-autofocus aria-describedby="project-name-error" />
          <sid3-field-error
            id="project-name-error"
            [control]="form.controls.name"
            [messages]="{ required: 'Dê um nome ao projeto.', minlength: 'Use pelo menos 2 caracteres.', maxlength: 'Use no máximo 100 caracteres.' }"
          />
        </form>
        <footer modal-footer class="modal__footer">
          <button class="btn" type="button" [disabled]="isSubmitting()" (click)="closeDialog()">Cancelar</button>
          <button class="btn btn--primary" type="submit" form="project-form" [disabled]="isSubmitting()">
            @if (isSubmitting()) {
              <sid3-icon name="loader" [spin]="true" />
            }
            {{ mode === 'create' ? 'Criar projeto' : 'Salvar' }}
          </button>
        </footer>
      </sid3-modal>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectsPageComponent {
  protected readonly projectContext = inject(ProjectContextService);
  private readonly projectsService = inject(ProjectsService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly confirm = inject(ConfirmService);

  protected readonly initials = initials;
  protected readonly plural = plural;
  protected readonly isSubmitting = signal(false);
  protected readonly loadError = signal<{ message: string; details: string | null } | null>(null);
  protected readonly dialog = signal<'create' | 'rename' | null>(null);
  protected readonly query = signal('');
  private renaming: Project | null = null;
  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]]
  });

  protected readonly visibleProjects = computed(() =>
    this.projectContext.projects().filter((project) => matchesQuery(this.query(), project.name))
  );

  constructor() {
    this.reload();
  }

  reload(): void {
    this.loadError.set(null);
    this.projectContext.refresh().subscribe({
      error: (error: unknown) => this.loadError.set({ message: toApiErrorMessage(error), details: toApiErrorDetails(error) })
    });
  }

  openCreate(): void {
    this.renaming = null;
    this.form.reset();
    this.dialog.set('create');
  }

  openRename(project: Project): void {
    this.renaming = project;
    this.form.reset({ name: project.name });
    this.dialog.set('rename');
  }

  closeDialog(): void {
    if (this.isSubmitting()) return;
    this.dialog.set(null);
  }

  submitDialog(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.dialog() === 'rename' && this.renaming) {
      this.rename(this.renaming, this.form.getRawValue().name);
    } else {
      this.createProject();
    }
  }

  createProject(): void {
    if (this.form.invalid || this.isSubmitting()) return;
    this.isSubmitting.set(true);
    this.projectsService
      .createProject({ name: this.form.getRawValue().name.trim() })
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: (project) => {
          this.form.reset();
          this.dialog.set(null);
          this.projectContext.upsert(project);
          this.projectContext.select(project.id);
          this.notifications.success(`Projeto "${project.name}" criado. Agora adicione uma conta do Drive.`);
          void this.router.navigateByUrl('/storage');
        },
        error: (error: unknown) => this.notifications.error(toApiErrorMessage(error))
      });
  }

  open(project: Project): void {
    this.projectContext.select(project.id);
    void this.router.navigateByUrl('/overview');
  }

  rename(project: Project, rawName: string): void {
    const name = rawName.trim();
    if (!name || name === project.name) {
      this.dialog.set(null);
      return;
    }
    this.isSubmitting.set(true);
    this.projectsService
      .updateProject(project.id, { name })
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: (updated) => {
          this.projectContext.upsert(updated);
          this.dialog.set(null);
          this.notifications.success('Projeto renomeado.');
        },
        error: (error: unknown) => this.notifications.error(toApiErrorMessage(error))
      });
  }

  async remove(project: Project): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: `Excluir o projeto "${project.name}"?`,
      message:
        'Buckets vazios, chaves de API e pools deste projeto serão apagados. As contas do Drive continuam em Conexões. Essa ação não pode ser desfeita.',
      confirmLabel: 'Excluir projeto'
    });
    if (!confirmed) return;
    this.projectsService.deleteProject(project.id).subscribe({
      next: () => {
        this.projectContext.remove(project.id);
        this.notifications.success(`Projeto "${project.name}" excluído.`);
      },
      error: (error: unknown) => this.notifications.error(toApiErrorMessage(error))
    });
  }
}
