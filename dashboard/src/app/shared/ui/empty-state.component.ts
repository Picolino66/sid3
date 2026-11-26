import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent } from './icon.component';

/** Estado vazio: diz o que vai aparecer aqui e como começar (ações projetadas). */
@Component({
  selector: 'sid3-empty-state',
  imports: [IconComponent],
  template: `
    <div class="state" [class.state--compact]="compact()">
      <span class="state__icon"><sid3-icon [name]="icon()" size="lg" /></span>
      <h3 class="state__title">{{ title() }}</h3>
      @if (description()) {
        <p class="state__text">{{ description() }}</p>
      }
      <div class="state__actions"><ng-content /></div>
    </div>
  `,
  styles: [':host { display: block; } .state__actions:empty { display: none; }'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EmptyStateComponent {
  readonly icon = input('file');
  readonly title = input.required<string>();
  readonly description = input<string | null>(null);
  readonly compact = input(false);
}
