import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { take } from 'rxjs';
import { toApiErrorMessage } from '../../core/api/api-error';
import { ConnectionsService } from './connections.service';
import { ErrorStateComponent } from '../../shared/ui/error-state.component';
import { IconComponent } from '../../shared/ui/icon.component';

@Component({
  selector: 'sid3-google-callback-page',
  imports: [RouterLink, IconComponent, ErrorStateComponent],
  template: `
    <section class="card" style="max-width: 560px; margin: var(--space-10) auto 0; width: 100%">
      @if (isLoading()) {
        <div class="state">
          <span class="state__icon"><sid3-icon name="loader" size="lg" [spin]="true" /></span>
          <h1 class="state__title">Concluindo a conexão com o Google Drive</h1>
          <p class="state__text">Isso leva só alguns segundos.</p>
        </div>
      } @else if (errorMessage()) {
        <sid3-error-state title="Não foi possível conectar o Google Drive" icon="plug" [message]="errorMessage()!" [retryable]="false">
          <a class="btn btn--primary btn--sm" routerLink="/connections">Voltar para Conexões</a>
        </sid3-error-state>
      } @else {
        <div class="state" role="status">
          <span class="state__icon"><sid3-icon name="ok" size="lg" /></span>
          <h1 class="state__title">Google Drive conectado</h1>
          <p class="state__text">Redirecionando para Conexões...</p>
        </div>
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
        this.errorMessage.set(
          providerError === 'access_denied'
            ? 'A autorização foi cancelada no Google. Tente conectar de novo quando quiser.'
            : `O Google recusou a autorização (${providerError}).`
        );
        return;
      }

      if (!code || !state) {
        this.isLoading.set(false);
        this.errorMessage.set('O retorno do Google veio incompleto. Inicie a conexão de novo em Conexões.');
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
