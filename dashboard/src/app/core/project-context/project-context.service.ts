import { computed, inject, Injectable, signal } from '@angular/core';
import { Observable, finalize, tap } from 'rxjs';
import { toApiErrorDetails, toApiErrorMessage } from '../api/api-error';
import { Project } from '../../features/projects/project.models';
import { ProjectsService } from '../../features/projects/projects.service';

const CURRENT_PROJECT_KEY = 'sid3.currentProjectId';

/**
 * Projeto em que o usuário está trabalhando. Um único seletor no topo da navegação define o contexto de
 * todas as telas do projeto (Início, Arquivos, Meu Drive, Armazenamento, Chaves, Logs...).
 */
@Injectable({ providedIn: 'root' })
export class ProjectContextService {
  private readonly projectsService = inject(ProjectsService);

  readonly projects = signal<Project[]>([]);
  readonly isLoading = signal(false);
  readonly loaded = signal(false);
  /** Falha ao carregar a lista de projetos (não confundir com "nenhum projeto"). */
  readonly loadError = signal<{ message: string; details: string | null } | null>(null);
  private readonly selectedId = signal<string | null>(readStoredProjectId());

  /** Projeto atual (o salvo, ou o primeiro disponível). */
  readonly currentProject = computed<Project | null>(() => {
    const projects = this.projects();
    return projects.find((project) => project.id === this.selectedId()) ?? projects[0] ?? null;
  });

  readonly currentProjectId = computed(() => this.currentProject()?.id ?? null);

  refresh(): Observable<Project[]> {
    this.isLoading.set(true);
    return this.projectsService.listProjects().pipe(
      tap((projects) => {
        this.projects.set(projects);
        this.loadError.set(null);
        this.loaded.set(true);
      }),
      finalize(() => this.isLoading.set(false))
    );
  }

  ensureLoaded(): void {
    if (!this.loaded() && !this.isLoading()) {
      this.refresh().subscribe({ error: (error: unknown) => this.markFailed(error) });
    }
  }

  /** Tenta carregar de novo depois de uma falha. */
  retry(): void {
    if (this.isLoading()) return;
    this.refresh().subscribe({ error: (error: unknown) => this.markFailed(error) });
  }

  private markFailed(error: unknown): void {
    this.loadError.set({ message: toApiErrorMessage(error), details: toApiErrorDetails(error) });
    this.loaded.set(true);
  }

  select(projectId: string): void {
    this.selectedId.set(projectId);
    try {
      localStorage.setItem(CURRENT_PROJECT_KEY, projectId);
    } catch {
      /* armazenamento indisponível: a seleção vale só nesta sessão */
    }
  }

  upsert(project: Project): void {
    this.projects.update((items) =>
      items.some((item) => item.id === project.id)
        ? items.map((item) => (item.id === project.id ? project : item))
        : [...items, project]
    );
  }

  remove(projectId: string): void {
    this.projects.update((items) => items.filter((item) => item.id !== projectId));
  }

  clear(): void {
    this.projects.set([]);
    this.loadError.set(null);
    this.loaded.set(false);
  }
}

function readStoredProjectId(): string | null {
  try {
    return localStorage.getItem(CURRENT_PROJECT_KEY);
  } catch {
    return null;
  }
}
