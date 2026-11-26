import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { NotificationService } from '../core/notifications/notification.service';
import { ProjectContextService } from '../core/project-context/project-context.service';

@Component({
  selector: 'sid3-dashboard-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <main class="shell">
      <aside class="sidebar" aria-label="Navegação principal">
        <div class="brand">
          <span class="brand-mark">S3</span>
          <div>
            <strong>SID3</strong>
            <span>{{ authService.currentUser()?.email ?? 'Gateway de armazenamento' }}</span>
          </div>
        </div>

        <div class="project-switcher">
          <label for="project-switcher">Projeto</label>
          @if (projectContext.projects().length > 0) {
            <select
              id="project-switcher"
              [value]="projectContext.currentProjectId() ?? ''"
              (change)="projectContext.select($any($event.target).value)"
            >
              @for (project of projectContext.projects(); track project.id) {
                <option [value]="project.id">{{ project.name }}</option>
              }
            </select>
          } @else {
            <a class="project-switcher-empty" routerLink="/projects">Criar o primeiro projeto</a>
          }
        </div>

        <nav>
          <span class="nav-group-label">Projeto</span>
          <a routerLink="/overview" routerLinkActive="active">Início</a>
          <a routerLink="/files" routerLinkActive="active">Arquivos</a>
          <a routerLink="/drive" routerLinkActive="active">Meu Drive</a>
          <a routerLink="/share-links" routerLinkActive="active">Links compartilhados</a>
          <a routerLink="/storage" routerLinkActive="active">Armazenamento</a>

          <span class="nav-group-label">Desenvolvedor</span>
          <a routerLink="/api-keys" routerLinkActive="active">Chaves de API</a>
          <a routerLink="/logs" routerLinkActive="active">Logs</a>
          <a routerLink="/stats" routerLinkActive="active">Estatísticas</a>
          <a routerLink="/docs" routerLinkActive="active">Documentação da API</a>

          <span class="nav-group-label">Conta</span>
          <a routerLink="/projects" routerLinkActive="active">Projetos</a>
          <a routerLink="/connections" routerLinkActive="active">Conexões</a>
        </nav>
        <button class="secondary full-width" type="button" (click)="logout()">Sair</button>
      </aside>

      <section class="content">
        <router-outlet />
      </section>

      @if (notificationService.notifications().length > 0) {
        <aside class="toast-container" aria-live="polite">
          @for (toast of notificationService.notifications(); track toast.id) {
            <div [class]="'toast toast--' + toast.type" role="alert">
              <span>{{ toast.message }}</span>
              <button class="toast-close" type="button" (click)="notificationService.dismiss(toast.id)" aria-label="Fechar notificação">×</button>
            </div>
          }
        </aside>
      }
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardShellComponent {
  protected readonly authService = inject(AuthService);
  protected readonly notificationService = inject(NotificationService);
  protected readonly projectContext = inject(ProjectContextService);
  private readonly router = inject(Router);

  constructor() {
    this.projectContext.ensureLoaded();
  }

  logout(): void {
    this.authService.logout();
    this.projectContext.clear();
    void this.router.navigateByUrl('/login');
  }
}
