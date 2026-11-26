import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../core/auth/auth.service';
import { NotificationService, NotificationType } from '../core/notifications/notification.service';
import { ProjectContextService } from '../core/project-context/project-context.service';
import { ThemeMode, ThemeService } from '../core/theme/theme.service';
import { ConfirmHostComponent } from '../shared/ui/confirm-host.component';
import { initials } from '../shared/ui/format';
import { IconComponent } from '../shared/ui/icon.component';
import { MenuComponent } from '../shared/ui/menu.component';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

interface NavGroup {
  label: string;
  /** Telas que dependem do projeto selecionado (aparecem com o projeto no breadcrumb). */
  scoped: boolean;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    label: 'Projeto',
    scoped: true,
    items: [
      { path: '/overview', label: 'Início', icon: 'home' },
      { path: '/files', label: 'Arquivos', icon: 'folder' },
      { path: '/drive', label: 'Meu Drive', icon: 'drive' },
      { path: '/share-links', label: 'Links compartilhados', icon: 'link' },
      { path: '/storage', label: 'Armazenamento', icon: 'db' },
      { path: '/stats', label: 'Estatísticas', icon: 'chart' }
    ]
  },
  {
    label: 'Desenvolvedor',
    scoped: true,
    items: [
      { path: '/api-keys', label: 'Chaves de API', icon: 'key' },
      { path: '/logs', label: 'Logs', icon: 'list' },
      { path: '/docs', label: 'Documentação da API', icon: 'book' }
    ]
  },
  {
    label: 'Gerenciar',
    scoped: false,
    items: [
      { path: '/projects', label: 'Projetos', icon: 'layers' },
      { path: '/connections', label: 'Conexões', icon: 'plug' }
    ]
  }
];

const UNSCOPED_PATHS = ['/projects', '/connections', '/docs'];

const TOAST_ICONS: Record<NotificationType, string> = {
  success: 'ok',
  error: 'alert',
  warning: 'alert',
  info: 'info'
};

@Component({
  selector: 'sid3-dashboard-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, IconComponent, MenuComponent, ConfirmHostComponent],
  template: `
    <div class="shell" [class.shell--drawer-open]="drawerOpen()">
      <aside class="sidebar" id="sid3-sidebar" aria-label="Navegação principal" (keydown.escape)="drawerOpen.set(false)">
        <a class="brand" routerLink="/overview">
          <span class="brand__mark" aria-hidden="true">S3</span>
          <span class="brand__name">SID3</span>
        </a>

        @if (projectContext.projects().length > 0) {
          <sid3-menu
            class="project-menu"
            [label]="'Trocar de projeto (atual: ' + (projectContext.currentProject()?.name ?? '') + ')'"
            [icon]="null"
            [tooltip]="false"
            triggerClass="project-switch"
            align="start"
            [matchWidth]="true"
          >
            <span menu-trigger class="project-switch__avatar">{{ initials(projectContext.currentProject()?.name) }}</span>
            <span menu-trigger class="project-switch__text">
              <strong>{{ projectContext.currentProject()?.name }}</strong>
              <small>Projeto atual</small>
            </span>
            <sid3-icon menu-trigger class="muted" name="updown" />
            <span class="menu-label">Projetos</span>
            @for (project of projectContext.projects(); track project.id) {
              <button
                type="button"
                role="menuitemradio"
                class="menu-item"
                [class.menu-item--active]="project.id === projectContext.currentProjectId()"
                [attr.aria-checked]="project.id === projectContext.currentProjectId()"
                (click)="projectContext.select(project.id)"
              >
                <span class="project-switch__avatar">{{ initials(project.name) }}</span>
                <span class="truncate" style="flex: 1">{{ project.name }}</span>
                @if (project.id === projectContext.currentProjectId()) {
                  <sid3-icon name="check" />
                }
              </button>
            }
            <hr class="menu-sep" />
            <a class="menu-item" role="menuitem" routerLink="/projects"><sid3-icon name="layers" />Gerenciar projetos</a>
          </sid3-menu>
        } @else if (projectContext.loadError()) {
          <button class="project-switch" type="button" [disabled]="projectContext.isLoading()" (click)="projectContext.retry()">
            <span class="project-switch__avatar"><sid3-icon name="refresh" size="sm" [spin]="projectContext.isLoading()" /></span>
            <span class="project-switch__text"><strong>Projetos indisponíveis</strong><small>Clique para tentar de novo</small></span>
          </button>
        } @else if (projectContext.loaded()) {
          <a class="project-switch" routerLink="/projects">
            <span class="project-switch__avatar"><sid3-icon name="plus" size="sm" /></span>
            <span class="project-switch__text"><strong>Criar projeto</strong><small>Nenhum projeto ainda</small></span>
          </a>
        } @else {
          <div class="project-switch" aria-hidden="true">
            <span class="skeleton" style="width: 28px; height: 28px"></span>
            <span class="skeleton" style="flex: 1; height: 12px"></span>
          </div>
        }

        <nav class="nav">
          @for (group of nav; track group.label) {
            <span class="nav__label">{{ group.label }}</span>
            @for (item of group.items; track item.path) {
              <a class="nav__link" [routerLink]="item.path" routerLinkActive="is-active" ariaCurrentWhenActive="page">
                <sid3-icon [name]="item.icon" />
                <span>{{ item.label }}</span>
              </a>
            }
          }
        </nav>

        <div class="sidebar__foot">
          <sid3-menu label="Conta e tema" [icon]="null" [tooltip]="false" triggerClass="user-chip" align="start" [matchWidth]="true">
            <span menu-trigger class="avatar">{{ initials(authService.currentUser()?.name ?? authService.currentUser()?.email) }}</span>
            <span menu-trigger class="user-chip__text">
              <strong>{{ authService.currentUser()?.name ?? 'Minha conta' }}</strong>
              <small>{{ authService.currentUser()?.email }}</small>
            </span>
            <sid3-icon menu-trigger class="muted" name="updown" />
            <span class="menu-label">Tema</span>
            @for (option of themeOptions; track option.value) {
              <button
                type="button"
                role="menuitemradio"
                class="menu-item"
                [class.menu-item--active]="theme.mode() === option.value"
                [attr.aria-checked]="theme.mode() === option.value"
                (click)="theme.set(option.value)"
              >
                <sid3-icon [name]="option.icon" />{{ option.label }}
                @if (theme.mode() === option.value) {
                  <sid3-icon name="check" style="margin-left: auto" />
                }
              </button>
            }
            <hr class="menu-sep" />
            <button type="button" role="menuitem" class="menu-item" (click)="logout()"><sid3-icon name="logout" />Sair</button>
          </sid3-menu>
        </div>
      </aside>

      <div class="drawer-backdrop" (click)="drawerOpen.set(false)"></div>

      <div class="main">
        <header class="topbar">
          <div class="topbar__left">
            <button
              class="btn btn--ghost btn--icon topbar__menu"
              type="button"
              aria-label="Abrir menu"
              aria-controls="sid3-sidebar"
              [attr.aria-expanded]="drawerOpen()"
              (click)="drawerOpen.set(true)"
            >
              <sid3-icon name="menu" size="lg" />
            </button>
            <nav class="crumbs" aria-label="Você está em">
              @if (scoped() && projectContext.currentProject(); as project) {
                <a class="crumbs__item" routerLink="/overview">{{ project.name }}</a>
                <sid3-icon class="crumbs__sep" name="chev" size="sm" />
              }
              <span class="crumbs__item" aria-current="page">{{ pageTitle() }}</span>
            </nav>
          </div>
          <div class="topbar__right">
            <button
              class="btn btn--ghost btn--icon btn--sm"
              type="button"
              [attr.aria-label]="theme.isDark() ? 'Usar tema claro' : 'Usar tema escuro'"
              [attr.data-tooltip]="theme.isDark() ? 'Tema claro' : 'Tema escuro'"
              data-tooltip-pos="left"
              (click)="theme.toggle()"
            >
              <sid3-icon [name]="theme.isDark() ? 'sun' : 'moon'" />
            </button>
          </div>
        </header>

        <main class="content" id="conteudo">
          <router-outlet />
        </main>
      </div>
    </div>

    <div class="toasts" aria-live="polite">
      @for (toast of notificationService.notifications(); track toast.id) {
        <div [class]="'toast toast--' + toast.type" [attr.role]="toast.type === 'error' ? 'alert' : 'status'">
          <sid3-icon class="toast__icon" [name]="toastIcon(toast.type)" />
          <span class="toast__message">{{ toast.message }}</span>
          <button class="btn btn--ghost btn--icon btn--sm" type="button" (click)="notificationService.dismiss(toast.id)" aria-label="Fechar notificação">
            <sid3-icon name="x" />
          </button>
        </div>
      }
    </div>

    <sid3-confirm-host />
  `,
  styles: [
    `
      .project-menu { display: block; width: 100%; }
      :host ::ng-deep .project-menu > button,
      :host ::ng-deep .sidebar__foot sid3-menu,
      :host ::ng-deep .sidebar__foot sid3-menu > button { width: 100%; }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardShellComponent {
  protected readonly authService = inject(AuthService);
  protected readonly notificationService = inject(NotificationService);
  protected readonly projectContext = inject(ProjectContextService);
  protected readonly theme = inject(ThemeService);
  private readonly router = inject(Router);

  protected readonly nav = NAV;
  protected readonly initials = initials;
  protected readonly drawerOpen = signal(false);
  protected readonly pageTitle = signal('');
  private readonly currentUrl = signal(this.router.url);
  protected readonly scoped = computed(() => !UNSCOPED_PATHS.some((path) => this.currentUrl().startsWith(path)));
  protected readonly themeOptions: { value: ThemeMode; label: string; icon: string }[] = [
    { value: 'system', label: 'Sistema', icon: 'monitor' },
    { value: 'light', label: 'Claro', icon: 'sun' },
    { value: 'dark', label: 'Escuro', icon: 'moon' }
  ];

  constructor() {
    this.projectContext.ensureLoaded();
    this.syncRoute();
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe(() => {
        this.syncRoute();
        this.drawerOpen.set(false);
      });
  }

  protected toastIcon(type: NotificationType): string {
    return TOAST_ICONS[type];
  }

  logout(): void {
    this.authService.logout();
    this.projectContext.clear();
    void this.router.navigateByUrl('/login');
  }

  private syncRoute(): void {
    this.currentUrl.set(this.router.url);
    let snapshot: ActivatedRouteSnapshot | null = this.router.routerState.snapshot.root;
    let title = '';
    while (snapshot) {
      if (snapshot.title) title = snapshot.title;
      snapshot = snapshot.firstChild;
    }
    this.pageTitle.set(title);
  }
}
