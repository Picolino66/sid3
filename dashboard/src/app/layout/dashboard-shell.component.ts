import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';

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
        <nav>
          <a routerLink="/projects" routerLinkActive="active">Projetos</a>
          <a routerLink="/connections" routerLinkActive="active">Conexões</a>
          <a routerLink="/buckets" routerLinkActive="active">Buckets</a>
          <a routerLink="/api-keys" routerLinkActive="active">Chaves de API</a>
          <a routerLink="/files" routerLinkActive="active">Arquivos</a>
          <span class="nav-group-label">Avançado</span>
          <a routerLink="/storage-pools" routerLinkActive="active">Pools de Armazenamento</a>
          <span class="nav-group-label">Monitoramento</span>
          <a routerLink="/stats" routerLinkActive="active">Estatísticas</a>
          <a routerLink="/logs" routerLinkActive="active">Logs</a>
          <a routerLink="/docs" routerLinkActive="active">Documentação da API</a>
        </nav>
        <button class="secondary full-width" type="button" (click)="logout()">Sair</button>
      </aside>

      <section class="content">
        <router-outlet />
      </section>
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardShellComponent {
  protected readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  logout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/login');
  }
}
