import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  OnDestroy,
  output,
  viewChild
} from '@angular/core';
import { IconComponent } from './icon.component';

let nextModalId = 0;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Diálogo modal padrão: overlay, foco preso dentro do painel, Esc e clique fora fecham, e o foco volta para
 * quem abriu. Corpo projetado; rodapé com `<footer modal-footer class="modal__footer">`.
 */
@Component({
  selector: 'sid3-modal',
  imports: [IconComponent],
  template: `
    <div class="overlay" (mousedown)="onBackdrop($event)">
      <div
        #panel
        [class]="'modal' + (size() === 'sm' ? '' : ' modal--' + size())"
        [attr.role]="role()"
        aria-modal="true"
        [attr.aria-labelledby]="title() ? titleId : null"
        [attr.aria-label]="title() ? null : ariaLabel()"
        tabindex="-1"
        (keydown)="onKeydown($event)"
      >
        @if (title()) {
          <header class="modal__header">
            @if (icon()) {
              <span [class]="'modal__icon' + (tone() === 'danger' ? '' : ' modal__icon--info')"><sid3-icon [name]="icon()!" size="lg" /></span>
            }
            <div style="flex: 1">
              <h2 class="modal__title" [id]="titleId">{{ title() }}</h2>
              @if (subtitle()) {
                <p class="modal__subtitle">{{ subtitle() }}</p>
              }
            </div>
            @if (closable()) {
              <button class="btn btn--ghost btn--icon btn--sm" type="button" aria-label="Fechar" (click)="closed.emit()">
                <sid3-icon name="x" />
              </button>
            }
          </header>
        }
        <ng-content select="[modal-header]" />
        <div class="modal__body">
          <ng-content />
        </div>
        <ng-content select="[modal-footer]" />
      </div>
    </div>
  `,
  styles: [':host { display: contents; }'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModalComponent implements OnDestroy {
  readonly title = input<string | null>(null);
  readonly subtitle = input<string | null>(null);
  readonly ariaLabel = input<string | null>(null);
  readonly icon = input<string | null>(null);
  readonly tone = input<'default' | 'danger'>('default');
  readonly size = input<'sm' | 'md' | 'lg' | 'xl'>('sm');
  readonly role = input<'dialog' | 'alertdialog'>('dialog');
  readonly closable = input(true);
  /** Quando falso, Esc e clique fora não fecham (ex.: durante um envio). */
  readonly dismissable = input(true);
  readonly closed = output<void>();

  readonly titleId = `sid3-modal-${nextModalId++}`;
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly previouslyFocused = document.activeElement as HTMLElement | null;

  constructor() {
    afterNextRender(() => {
      const panel = this.panel().nativeElement;
      const autofocus = panel.querySelector<HTMLElement>('[autofocus], [data-autofocus]');
      const first = autofocus ?? panel.querySelector<HTMLElement>('.modal__body ' + FOCUSABLE + ', [modal-footer] ' + FOCUSABLE);
      (first ?? panel).focus();
    });
  }

  ngOnDestroy(): void {
    if (this.previouslyFocused && document.contains(this.previouslyFocused)) {
      this.previouslyFocused.focus();
    }
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget && this.dismissable()) {
      this.closed.emit();
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (this.dismissable()) this.closed.emit();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusables = Array.from(this.panel().nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (element) => element.offsetParent !== null || element === document.activeElement
    );
    if (focusables.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
