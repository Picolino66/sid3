import { ChangeDetectionStrategy, Component, ElementRef, input, signal, viewChild } from '@angular/core';
import { IconComponent } from './icon.component';

/**
 * Menu suspenso acionado por um botão (ex.: "⋯" de ações da linha). Itens projetados com a classe `menu-item`.
 * Posição fixa calculada a partir do botão, para não ser cortado por tabelas com rolagem.
 * Teclado: setas navegam, Esc fecha e devolve o foco, clicar num item fecha.
 */
@Component({
  selector: 'sid3-menu',
  imports: [IconComponent],
  host: {
    '(document:mousedown)': 'onDocumentPointer($event)',
    '(window:resize)': 'close()',
    '(window:scroll)': 'close()'
  },
  template: `
    <button
      #trigger
      type="button"
      [class]="triggerClass()"
      [attr.aria-label]="text() ? null : label()"
      [attr.data-tooltip]="text() || !tooltip() ? null : label()"
      [attr.data-tooltip-pos]="text() || !tooltip() ? null : 'left'"
      aria-haspopup="menu"
      [attr.aria-expanded]="open()"
      [disabled]="disabled()"
      (click)="toggle()"
    >
      <ng-content select="[menu-trigger]" />
      @if (icon()) {
        <sid3-icon [name]="icon()!" />
      }
      @if (text()) {
        <span class="truncate">{{ text() }}</span>
        <sid3-icon name="chev-down" size="sm" />
      }
    </button>
    @if (open()) {
      <div
        #panel
        class="menu"
        role="menu"
        [attr.aria-label]="label()"
        [style.top.px]="position().top"
        [style.bottom.px]="position().bottom"
        [style.left.px]="position().left"
        [style.right.px]="position().right"
        [style.min-width.px]="position().minWidth"
        (click)="onPanelClick($event)"
        (keydown)="onKeydown($event)"
      >
        <ng-content />
      </div>
    }
  `,
  styles: [':host { display: inline-flex; position: relative; }'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MenuComponent {
  readonly label = input('Mais ações');
  readonly icon = input<string | null>('more');
  readonly text = input<string | null>(null);
  readonly triggerClass = input('btn btn--ghost btn--icon btn--sm');
  readonly align = input<'start' | 'end'>('end');
  readonly matchWidth = input(false);
  readonly disabled = input(false);
  readonly tooltip = input(true);

  protected readonly open = signal(false);
  protected readonly position = signal<{ top?: number; bottom?: number; left?: number; right?: number; minWidth?: number }>({});
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  toggle(): void {
    if (this.open()) {
      this.close();
    } else {
      this.show();
    }
  }

  close(returnFocus = false): void {
    if (!this.open()) return;
    this.open.set(false);
    if (returnFocus) this.trigger().nativeElement.focus();
  }

  private show(): void {
    const rect = this.trigger().nativeElement.getBoundingClientRect();
    const openUp = rect.bottom + 280 > window.innerHeight && rect.top > 280;
    this.position.set({
      top: openUp ? undefined : rect.bottom + 4,
      bottom: openUp ? window.innerHeight - rect.top + 4 : undefined,
      left: this.align() === 'start' ? rect.left : undefined,
      right: this.align() === 'end' ? window.innerWidth - rect.right : undefined,
      minWidth: this.matchWidth() ? rect.width : undefined
    });
    this.open.set(true);
    setTimeout(() => this.items()[0]?.focus());
  }

  protected onDocumentPointer(event: MouseEvent): void {
    if (!this.open()) return;
    const target = event.target as Node;
    if (this.trigger().nativeElement.contains(target) || this.panel()?.nativeElement.contains(target)) return;
    this.close();
  }

  protected onPanelClick(event: MouseEvent): void {
    const item = (event.target as HTMLElement).closest('.menu-item');
    if (item && !(item as HTMLButtonElement).disabled) {
      this.close(true);
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    const items = this.items();
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close(true);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (event.key === 'Tab') {
      this.close();
    }
  }

  private items(): HTMLElement[] {
    return Array.from(this.panel()?.nativeElement.querySelectorAll<HTMLElement>('.menu-item:not(:disabled)') ?? []);
  }
}
