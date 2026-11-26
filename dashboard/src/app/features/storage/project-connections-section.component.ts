import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { toApiErrorMessage } from '../../core/api/api-error';
import { NotificationService } from '../../core/notifications/notification.service';
import { ConfirmService } from '../../shared/ui/confirm.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { connectionStatusLabel, connectionStatusTone, initials, plural } from '../../shared/ui/format';
import { IconComponent } from '../../shared/ui/icon.component';
import { MenuComponent } from '../../shared/ui/menu.component';
import { Connection } from '../connections/connection.models';
import { ProjectConnection } from '../projects/project.models';
import { ProjectsService } from '../projects/projects.service';

/** Quais contas do Google Drive (de Conexões) este projeto pode usar. */
@Component({
  selector: 'sid3-project-connections-section',
  imports: [NgTemplateOutlet, RouterLink, EmptyStateComponent, IconComponent, MenuComponent],
  template: `
    <section class="card">
      <header class="card__header">
        <div>
          <h2 class="card__title">Contas do Google Drive</h2>
          <p class="card__desc">Escolha entre as contas já conectadas. A mesma conta pode estar em vários projetos.</p>
        </div>
        <ng-container *ngTemplateOutlet="addMenu" />
      </header>

      @if (linked().length === 0) {
        <sid3-empty-state
          icon="drive"
          title="Nenhuma conta neste projeto"
          description="Adicione uma conta do Google Drive para poder criar buckets e enviar arquivos."
          [compact]="true"
        />
      } @else {
        <ul class="row-list" style="margin-top: var(--space-3)">
          @for (connection of linked(); track connection.connectionId) {
            <li class="row-item">
              <span class="row-item__avatar" aria-hidden="true">{{ initials(connection.displayName ?? connection.providerAccountEmail) }}</span>
              <div class="row-item__main">
                <strong class="truncate">{{ connection.displayName ?? 'Google Drive' }}</strong>
                <span class="row-item__meta truncate">{{ connection.providerAccountEmail ?? 'Conta ainda não identificada' }}</span>
              </div>
              <div class="row-item__aside">
                <span class="muted text-sm">{{ plural(connection.bucketCount, 'bucket', 'buckets') }}</span>
                <span [class]="'chip chip--' + statusTone(connection.status)">{{ statusLabel(connection.status) }}</span>
                <sid3-menu [label]="'Ações de ' + (connection.displayName ?? 'Google Drive')">
                  <a class="menu-item" role="menuitem" routerLink="/connections"><sid3-icon name="plug" />Ver em Conexões</a>
                  <hr class="menu-sep" />
                  <button
                    class="menu-item menu-item--danger"
                    type="button"
                    role="menuitem"
                    [disabled]="busyId() === connection.connectionId"
                    (click)="unlink(connection)"
                  >
                    <sid3-icon name="unlink" />Remover do projeto
                  </button>
                </sid3-menu>
              </div>
            </li>
          }
        </ul>
      }
    </section>

    <ng-template #addMenu>
      @if (available().length > 0) {
        <sid3-menu text="Adicionar conta" [icon]="null" label="Adicionar conta ao projeto" triggerClass="btn btn--sm" [disabled]="busyId() === 'link'">
          <span class="menu-label">Contas conectadas</span>
          @for (connection of available(); track connection.id) {
            <button class="menu-item" type="button" role="menuitem" (click)="link(connection.id)">
              <span class="row-item__avatar row-item__avatar--sm" aria-hidden="true">{{ initials(connection.displayName ?? connection.providerAccountEmail) }}</span>
              <span class="cell-main" style="text-align: left">
                <strong>{{ connection.displayName ?? 'Google Drive' }}</strong>
                @if (connection.providerAccountEmail) {
                  <span>{{ connection.providerAccountEmail }}</span>
                }
              </span>
            </button>
          }
          <hr class="menu-sep" />
          <a class="menu-item" role="menuitem" routerLink="/connections"><sid3-icon name="plus" />Conectar outra conta</a>
        </sid3-menu>
      } @else {
        <a class="btn btn--sm" routerLink="/connections"><sid3-icon name="plus" />Conectar outra conta</a>
      }
    </ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectConnectionsSectionComponent {
  private readonly projectsService = inject(ProjectsService);
  private readonly notifications = inject(NotificationService);
  private readonly confirm = inject(ConfirmService);

  readonly projectId = input.required<string>();
  readonly linked = input.required<ProjectConnection[]>();
  readonly allConnections = input.required<Connection[]>();
  readonly changed = output<void>();

  protected readonly initials = initials;
  protected readonly plural = plural;
  protected readonly statusTone = connectionStatusTone;
  protected readonly busyId = signal<string | null>(null);
  protected readonly available = computed(() => {
    const linkedIds = new Set(this.linked().map((link) => link.connectionId));
    return this.allConnections().filter((connection) => !linkedIds.has(connection.id) && connection.status !== 'REVOKED');
  });

  protected statusLabel(status: ProjectConnection['status']): string {
    return connectionStatusLabel(status);
  }

  link(connectionId: string): void {
    if (!connectionId) return;
    this.run('link', this.projectsService.linkConnection(this.projectId(), connectionId), 'Conta adicionada ao projeto.');
  }

  async unlink(connection: ProjectConnection): Promise<void> {
    const name = connection.displayName ?? 'Google Drive';
    const confirmed = await this.confirm.ask({
      title: `Remover "${name}" deste projeto?`,
      message: 'A conexão continua existindo em Conexões e pode ser adicionada de novo depois.',
      confirmLabel: 'Remover do projeto'
    });
    if (!confirmed) return;
    this.run(connection.connectionId, this.projectsService.unlinkConnection(this.projectId(), connection.connectionId), `"${name}" removida do projeto.`);
  }

  private run(busyKey: string, request: Observable<unknown>, successMessage: string): void {
    this.busyId.set(busyKey);
    request.subscribe({
      next: () => undefined,
      complete: () => {
        this.busyId.set(null);
        this.notifications.success(successMessage);
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        this.notifications.error(toApiErrorMessage(error));
      }
    });
  }
}
