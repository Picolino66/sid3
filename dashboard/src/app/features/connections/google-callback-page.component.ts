import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { take } from 'rxjs';
import { toApiErrorMessage } from '../../core/api/api-error';
import { ConnectionsService } from './connections.service';

@Component({
  selector: 'sid3-google-callback-page',
  imports: [RouterLink],
  template: `
    <header class="topbar">
      <div>
        <p class="eyebrow">Google Drive</p>
        <h1>Concluindo conexão</h1>
      </div>
    </header>

    <section class="panel">
      @if (isLoading()) {
        <p class="muted">Concluindo autorização do Google Drive...</p>
      } @else if (errorMessage()) {
        <p class="form-error">{{ errorMessage() }}</p>
        <a class="button-link" routerLink="/connections">Voltar para conexões</a>
      } @else {
        <p class="empty-state">Google Drive conectado. Redirecionando...</p>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GoogleCallbackPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly connectionsService = inject(ConnectionsService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly isLoading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  constructor() {
    this.completeConnection();
  }

  private completeConnection(): void {
    this.route.queryParamMap.pipe(take(1), takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const providerError = params.get('error');
      const code = params.get('code');
      const state = params.get('state');

      if (providerError) {
        this.isLoading.set(false);
        this.errorMessage.set(`Autorização do Google falhou: ${providerError}`);
        return;
      }

      if (!code || !state) {
        this.isLoading.set(false);
        this.errorMessage.set('Callback do Google não contém code ou state.');
        return;
      }

      this.connectionsService
        .completeGoogleConnection({ code, state })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.isLoading.set(false);
            void this.router.navigateByUrl('/connections');
          },
          error: (error: unknown) => {
            this.isLoading.set(false);
            this.errorMessage.set(toApiErrorMessage(error));
          }
        });
    });
  }
}
