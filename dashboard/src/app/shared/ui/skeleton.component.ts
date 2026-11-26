import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Skeleton no formato do conteúdo final: linhas de lista/tabela, KPIs ou grade de mídia. */
@Component({
  selector: 'sid3-skeleton',
  template: `
    <div class="sk" [class]="'sk sk--' + variant()" aria-busy="true" [attr.aria-label]="label()">
      @switch (variant()) {
        @case ('kpis') {
          @for (i of items(); track i) {
            <div class="card sk__kpi"><span class="skeleton" style="width: 45%; height: 12px"></span><span class="skeleton" style="width: 60%; height: 26px"></span></div>
          }
        }
        @case ('grid') {
          @for (i of items(); track i) {
            <span class="skeleton sk__tile"></span>
          }
        }
        @default {
          @for (i of items(); track i) {
            <div class="sk__row">
              <span class="skeleton sk__avatar"></span>
              <div class="sk__lines">
                <span class="skeleton" [style.width.%]="55 + ((i * 13) % 30)" style="height: 12px"></span>
                <span class="skeleton" [style.width.%]="25 + ((i * 7) % 20)" style="height: 10px"></span>
              </div>
              <span class="skeleton sk__end"></span>
            </div>
          }
        }
      }
    </div>
  `,
  styles: [
    `
      :host { display: block; }
      .sk--rows { display: grid; }
      .sk__row { align-items: center; border-bottom: 1px solid var(--color-line); display: flex; gap: var(--space-3); padding: var(--space-3) var(--space-5); }
      .sk__row:last-child { border-bottom: 0; }
      .sk__avatar { border-radius: var(--radius-md); height: 32px; width: 32px; flex-shrink: 0; }
      .sk__lines { display: grid; flex: 1; gap: 6px; }
      .sk__end { height: 22px; width: 64px; border-radius: var(--radius-full); }
      .sk--kpis { display: grid; gap: var(--space-4); grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr)); }
      .sk__kpi { display: grid; gap: var(--space-3); padding: var(--space-4) var(--space-5); }
      .sk--grid { display: grid; gap: var(--space-3); grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
      .sk__tile { aspect-ratio: 1; border-radius: var(--radius-md); }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SkeletonComponent {
  readonly variant = input<'rows' | 'kpis' | 'grid'>('rows');
  readonly count = input(4);
  readonly label = input('Carregando');
  protected readonly items = computed(() => Array.from({ length: this.count() }, (_, index) => index));
}
