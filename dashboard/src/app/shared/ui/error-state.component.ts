import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IconComponent } from './icon.component';

/** Estado de erro: mensagem clara, "Tentar novamente" e detalhe técnico recolhido. Nunca confundir com vazio. */
@Component({
  selector: 'sid3-error-state',
  imports: [IconComponent],
  template: `
    <div class="state state--error" [class.state--compact]="compact()" role="alert">
      <span class="state__icon"><sid3-icon [name]="icon()" size="lg" /></span>
      <h3 class="state__title">{{ title() }}</h3>
      <p class="state__text">{{ message() }}</p>
      <div class="state__actions">
        @if (retryable()) {
          <button class="btn btn--sm" type="button" [disabled]="busy()" (click)="retry.emit()">
            <sid3-icon name="refresh" [spin]="busy()" />
            {{ busy() ? 'Tentando...' : 'Tentar novamente' }}
          </button>
        }
        <ng-content />
      </div>
      @if (details()) {
        <details class="state__details">
          <summary>Detalhes técnicos</summary>
          <code>{{ details() }}</code>
        </details>
      }
    </div>
  `,
  styles: [':host { display: block; }'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ErrorStateComponent {
  readonly title = input('Não foi possível carregar');
  readonly message = input.required<string>();
  readonly details = input<string | null>(null);
  readonly icon = input('cloudoff');
  readonly retryable = input(true);
  readonly busy = input(false);
  readonly compact = input(false);
  readonly retry = output<void>();
}
