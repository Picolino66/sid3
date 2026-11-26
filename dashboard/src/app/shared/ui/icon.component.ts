import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Ícone do sprite local (Lucide). Decorativo por padrão; passe `label` quando o ícone transmitir sentido sozinho. */
@Component({
  selector: 'sid3-icon',
  template: `
    <svg [class]="classes()" [attr.aria-hidden]="label() ? null : 'true'" [attr.role]="label() ? 'img' : null" [attr.aria-label]="label()" focusable="false">
      <use [attr.href]="'#i-' + name()" />
    </svg>
  `,
  styles: [':host { display: inline-flex; flex-shrink: 0; }'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IconComponent {
  readonly name = input.required<string>();
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly label = input<string | null>(null);
  readonly spin = input(false);

  protected readonly classes = computed(
    () => `icon${this.size() === 'md' ? '' : ' icon--' + this.size()}${this.spin() ? ' spinner' : ''}`
  );
}
