import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Cabeçalho padrão de página: título, descrição curta e ações (conteúdo projetado). */
@Component({
  selector: 'sid3-page-header',
  host: { class: 'page-header' },
  template: `
    <div class="page-header__text">
      <h1 class="page-header__title">{{ title() }}</h1>
      @if (description()) {
        <p class="page-header__desc">{{ description() }}</p>
      }
    </div>
    <div class="page-header__actions">
      <ng-content />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly description = input<string | null>(null);
}
