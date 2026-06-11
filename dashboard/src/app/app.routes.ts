import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'projects'
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login-page.component').then((m) => m.LoginPageComponent)
  },
  {
    path: 'register',
    loadComponent: () => import('./features/auth/register-page.component').then((m) => m.RegisterPageComponent)
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/dashboard-shell.component').then((m) => m.DashboardShellComponent),
    children: [
      {
        path: 'projects',
        loadComponent: () => import('./features/projects/projects-page.component').then((m) => m.ProjectsPageComponent)
      },
      {
        path: 'connections',
        loadComponent: () =>
          import('./features/connections/connections-page.component').then((m) => m.ConnectionsPageComponent)
      },
      {
        path: 'connections/google/callback',
        loadComponent: () =>
          import('./features/connections/google-callback-page.component').then((m) => m.GoogleCallbackPageComponent)
      },
      {
        path: 'api-keys',
        loadComponent: () => import('./features/api-keys/api-keys-page.component').then((m) => m.ApiKeysPageComponent)
      },
      {
        path: 'buckets',
        loadComponent: () => import('./features/buckets/buckets-page.component').then((m) => m.BucketsPageComponent)
      },
      {
        path: 'storage-pools',
        loadComponent: () =>
          import('./features/storage-pools/storage-pools-page.component').then((m) => m.StoragePoolsPageComponent)
      },
      {
        path: 'stats',
        loadComponent: () => import('./features/stats/stats-page.component').then((m) => m.StatsPageComponent)
      },
      {
        path: 'files',
        loadComponent: () => import('./features/files/files-page.component').then((m) => m.FilesPageComponent)
      },
      {
        path: 'logs',
        loadComponent: () => import('./features/logs/logs-page.component').then((m) => m.LogsPageComponent)
      },
      {
        path: 'docs',
        loadComponent: () => import('./features/docs/docs-page.component').then((m) => m.DocsPageComponent)
      }
    ]
  },
  {
    path: '**',
    redirectTo: 'projects'
  }
];
