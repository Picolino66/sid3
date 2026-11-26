import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'overview'
  },
  {
    path: 'login',
    title: 'Entrar',
    loadComponent: () => import('./features/auth/login-page.component').then((m) => m.LoginPageComponent)
  },
  {
    path: 'register',
    title: 'Criar conta',
    loadComponent: () => import('./features/auth/register-page.component').then((m) => m.RegisterPageComponent)
  },
  {
    // Página pública de um link compartilhado: sem login e sem o layout do dashboard.
    path: 's/:token',
    title: 'Arquivos compartilhados',
    loadComponent: () =>
      import('./features/share-links/public-share-page.component').then((m) => m.PublicSharePageComponent)
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/dashboard-shell.component').then((m) => m.DashboardShellComponent),
    children: [
      {
        path: 'overview',
        title: 'Início',
        loadComponent: () => import('./features/overview/overview-page.component').then((m) => m.OverviewPageComponent)
      },
      {
        path: 'storage',
        title: 'Armazenamento',
        loadComponent: () => import('./features/storage/storage-page.component').then((m) => m.StoragePageComponent)
      },
      {
        path: 'projects',
        title: 'Projetos',
        loadComponent: () => import('./features/projects/projects-page.component').then((m) => m.ProjectsPageComponent)
      },
      {
        path: 'connections',
        title: 'Conexões',
        loadComponent: () =>
          import('./features/connections/connections-page.component').then((m) => m.ConnectionsPageComponent)
      },
      {
        path: 'drive',
        title: 'Meu Drive',
        loadComponent: () => import('./features/drive/drive-page.component').then((m) => m.DrivePageComponent)
      },
      {
        path: 'share-links',
        title: 'Links compartilhados',
        loadComponent: () =>
          import('./features/share-links/share-links-page.component').then((m) => m.ShareLinksPageComponent)
      },
      {
        path: 'connections/google/callback',
        title: 'Conectando Google Drive',
        loadComponent: () =>
          import('./features/connections/google-callback-page.component').then((m) => m.GoogleCallbackPageComponent)
      },
      {
        path: 'api-keys',
        title: 'Chaves de API',
        loadComponent: () => import('./features/api-keys/api-keys-page.component').then((m) => m.ApiKeysPageComponent)
      },
      // Buckets e pools agora ficam em Armazenamento.
      { path: 'buckets', redirectTo: 'storage' },
      { path: 'storage-pools', redirectTo: 'storage' },
      {
        path: 'stats',
        title: 'Estatísticas',
        loadComponent: () => import('./features/stats/stats-page.component').then((m) => m.StatsPageComponent)
      },
      {
        path: 'files',
        title: 'Arquivos',
        loadComponent: () => import('./features/files/files-page.component').then((m) => m.FilesPageComponent)
      },
      {
        path: 'logs',
        title: 'Logs',
        loadComponent: () => import('./features/logs/logs-page.component').then((m) => m.LogsPageComponent)
      },
      {
        path: 'docs',
        title: 'Documentação da API',
        loadComponent: () => import('./features/docs/docs-page.component').then((m) => m.DocsPageComponent)
      }
    ]
  },
  {
    path: '**',
    redirectTo: 'overview'
  }
];
