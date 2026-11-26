import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ConfirmService } from './confirm.service';
import { ModalComponent } from './modal.component';

@Component({
  selector: 'sid3-confirm-host',
  imports: [ModalComponent],
  template: `
    @if (confirm.pending(); as dialog) {
      <sid3-modal
        role="alertdialog"
        [title]="dialog.title"
        [icon]="dialog.tone === 'danger' ? 'alert' : 'info'"
        [tone]="dialog.tone === 'danger' ? 'danger' : 'default'"
        [closable]="false"
        (closed)="confirm.settle(false)"
      >
        <p>{{ dialog.message }}</p>
        <footer modal-footer class="modal__footer">
          <button class="btn" type="button" data-autofocus (click)="confirm.settle(false)">{{ dialog.cancelLabel }}</button>
          <button [class]="dialog.tone === 'danger' ? 'btn btn--danger' : 'btn btn--primary'" type="button" (click)="confirm.settle(true)">
            {{ dialog.confirmLabel }}
          </button>
        </footer>
      </sid3-modal>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConfirmHostComponent {
  protected readonly confirm = inject(ConfirmService);
}
