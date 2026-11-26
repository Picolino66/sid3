import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toApiErrorMessage } from '../../core/api/api-error';
import { connectionStatusLabel } from '../../shared/ui/format';
import { Connection } from '../connections/connection.models';
import { ProjectConnection } from '../projects/project.models';
import { ProjectsService } from '../projects/projects.service';

/** Quais contas do Google Drive (de Conexões) este projeto pode usar. */
@Component({
  selector: 'sid3-project-connections-section',
  imports: [RouterLink],
  template: `
    <section class="panel">
      <header class="panel-header-row">
        <div>
          <h2>Contas do Google Drive neste projeto</h2>
          <p class="muted">Escolha entre as contas já conectadas. A mesma conta pode estar em vários projetos.</p>
        </div>
      </header>

      @if (errorMessage()) {
        <p class="form-error">{{ errorMessage() }}</p>
      }

      @if (linked().length === 0) {
        <p class="empty-state">Nenhuma conta adicionada a este projeto ainda.</p>
      } @else {
        <ul class="row-list">
          @for (connection of linked(); track connection.connectionId) {
            <li class="row-item">
              <div class="row-main">
                <strong>{{ connection.displayName ?? 'GOOGLE_DRIVE' }}</strong>
                <span class="muted">{{ connection.providerAccountEmail ?? 'conta ainda não identificada' }}</span>
              </div>
              <span [class]="'status-label ' + connection.status.toLowerCase()">{{ statusLabel(connection.status) }}</span>
              <span class="muted">{{ connection.bucketCount }} bucket(s)</span>
              <button
                class="secondary compact-button"
                type="button"
                [disabled]="busyId() === connection.connectionId"
                (click)="unlink(connection)"
              >
                Remover do projeto
              </button>
            </li>
          }
        </ul>
      }

      <div class="inline-form">
        @if (available().length > 0) {
          <select #picker aria-label="Conta para adicionar ao projeto">
            @for (connection of available(); track connection.id) {
              <option [value]="connection.id">
                {{ connection.displayName ?? 'GOOGLE_DRIVE' }}{{ connection.providerAccountEmail ? ' — ' + connection.providerAccountEmail : '' }}
              </option>
            }
          </select>
          <button type="button" [disabled]="busyId() === 'link'" (click)="link(picker.value)">Adicionar ao projeto</button>
        } @else {
          <p class="muted">Todas as suas contas conectadas já estão neste projeto.</p>
        }
        <a class="secondary-link" routerLink="/connections">Conectar outra conta</a>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectConnectionsSectionComponent {
  private readonly projectsService = inject(ProjectsService);

  readonly projectId = input.required<string>();
  readonly linked = input.required<ProjectConnection[]>();
  readonly allConnections = input.required<Connection[]>();
  readonly changed = output<void>();

  protected readonly busyId = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly available = computed(() => {
    const linkedIds = new Set(this.linked().map((link) => link.connectionId));
    return this.allConnections().filter((connection) => !linkedIds.has(connection.id) && connection.status !== 'REVOKED');
  });

  protected statusLabel(status: ProjectConnection['status']): string {
    return connectionStatusLabel(status);
  }

  link(connectionId: string): void {
    if (!connectionId) return;
    this.run('link', this.projectsService.linkConnection(this.projectId(), connectionId));
  }

  unlink(connection: ProjectConnection): void {
    const name = connection.displayName ?? 'GOOGLE_DRIVE';
    if (!window.confirm(`Remover "${name}" deste projeto? A conexão continua existindo em Conexões.`)) return;
    this.run(connection.connectionId, this.projectsService.unlinkConnection(this.projectId(), connection.connectionId));
  }

  private run(busyKey: string, request: { subscribe: (observer: object) => unknown }): void {
    this.busyId.set(busyKey);
    this.errorMessage.set(null);
    request.subscribe({
      next: () => undefined,
      complete: () => {
        this.busyId.set(null);
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        this.errorMessage.set(toApiErrorMessage(error));
      }
    });
  }
}
