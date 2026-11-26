import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { toApiErrorMessage } from '../../core/api/api-error';
import { NotificationService } from '../../core/notifications/notification.service';
import { ShareLink, shareLinkUrl } from './share-link.models';
import { ShareLinksService } from './share-links.service';
import { IconComponent } from '../../shared/ui/icon.component';
import { ModalComponent } from '../../shared/ui/modal.component';

export type ShareableItem = { id: string; name: string; isFolder: boolean };

const EXPIRATION_OPTIONS = [
  { value: 0, label: 'Nunca expira' },
  { value: 1, label: '1 dia' },
  { value: 7, label: '7 dias' },
  { value: 30, label: '30 dias' },
  { value: 90, label: '90 dias' }
] as const;

@Component({
  selector: 'sid3-create-share-link-dialog',
  imports: [ReactiveFormsModule, IconComponent, ModalComponent],
  template: `
    @if (createdLink(); as link) {
      <sid3-modal title="Link público criado" subtitle="Qualquer pessoa com o link pode ver e baixar os itens." icon="ok" (closed)="close()">
        <div class="field">
          <span class="field__label">Link</span>
          <div class="input-group">
            <input class="input mono" readonly [value]="url(link)" aria-label="Link público" (focus)="$any($event.target).select()" />
            <button class="btn" type="button" data-autofocus (click)="copy(link)"><sid3-icon [name]="copied() ? 'check' : 'copy'" />{{ copied() ? 'Copiado' : 'Copiar' }}</button>
          </div>
          <span class="field__hint">Você pode desativá-lo a qualquer momento em Links compartilhados.</span>
        </div>
        <footer modal-footer class="modal__footer">
          <a class="btn" [href]="url(link)" target="_blank" rel="noopener"><sid3-icon name="external" />Abrir</a>
          <button class="btn btn--primary" type="button" (click)="close()">Concluir</button>
        </footer>
      </sid3-modal>
    } @else {
      <sid3-modal title="Gerar link público" [subtitle]="items().length + (items().length === 1 ? ' item selecionado' : ' itens selecionados') + ' · pastas incluem todo o conteúdo'" [dismissable]="!isSubmitting()" (closed)="close()">
        <ul class="share-items">
          @for (item of previewItems(); track item.id) {
            <li><sid3-icon [name]="item.isFolder ? 'folder' : 'file'" size="sm" /><span class="truncate">{{ item.name }}</span></li>
          }
          @if (items().length > previewItems().length) {
            <li class="muted">e mais {{ items().length - previewItems().length }}...</li>
          }
        </ul>

        <form id="share-form" class="stack-sm" [formGroup]="form" (ngSubmit)="submit()">
          <div class="field">
            <label class="field__label" for="share-name">Nome do link <span class="muted">(opcional)</span></label>
            <input id="share-name" class="input" type="text" formControlName="name" maxlength="120" placeholder="Ex.: Fotos do evento" data-autofocus />
          </div>
          <div class="field">
            <label class="field__label" for="share-expiration">Validade</label>
            <select id="share-expiration" class="select" formControlName="expiresInDays">
              @for (option of expirationOptions; track option.value) {
                <option [ngValue]="option.value">{{ option.label }}</option>
              }
            </select>
          </div>
          @if (errorMessage()) {
            <div class="callout callout--danger" role="alert"><sid3-icon name="alert" /><span class="callout__text">{{ errorMessage() }}</span></div>
          }
        </form>
        <footer modal-footer class="modal__footer">
          <button class="btn" type="button" [disabled]="isSubmitting()" (click)="close()">Cancelar</button>
          <button class="btn btn--primary" type="submit" form="share-form" [disabled]="isSubmitting() || form.invalid">
            <sid3-icon [name]="isSubmitting() ? 'loader' : 'link'" [spin]="isSubmitting()" />{{ isSubmitting() ? 'Gerando...' : 'Gerar link' }}
          </button>
        </footer>
      </sid3-modal>
    }
  `,
  styles: [
    `
      .share-items { background: var(--color-soft); border-radius: var(--radius-md); display: grid; font-size: var(--text-sm); gap: 6px; list-style: none; margin: 0; max-height: 160px; overflow: auto; padding: var(--space-3); }
      .share-items li { align-items: center; display: flex; gap: var(--space-2); min-width: 0; }
      .share-items sid3-icon { color: var(--color-muted); }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CreateShareLinkDialogComponent {
  private readonly shareLinksService = inject(ShareLinksService);
  private readonly notificationService = inject(NotificationService);

  readonly connectionId = input.required<string>();
  readonly items = input.required<ShareableItem[]>();
  readonly closed = output<void>();
  readonly created = output<ShareLink>();

  protected readonly expirationOptions = EXPIRATION_OPTIONS;
  protected readonly isSubmitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly createdLink = signal<ShareLink | null>(null);
  protected readonly copied = signal(false);

  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(120)] }),
    expiresInDays: new FormControl<number>(0, { nonNullable: true })
  });

  protected previewItems(): ShareableItem[] {
    return this.items().slice(0, 5);
  }

  protected url(link: ShareLink): string {
    return shareLinkUrl(link);
  }

  protected submit(): void {
    if (this.form.invalid || this.items().length === 0) return;

    const { name, expiresInDays } = this.form.getRawValue();
    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    this.shareLinksService
      .createShareLink({
        connectionId: this.connectionId(),
        fileIds: this.items().map((item) => item.id),
        name: name.trim() || undefined,
        expiresInDays: expiresInDays > 0 ? expiresInDays : undefined
      })
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: (link) => {
          this.createdLink.set(link);
          this.created.emit(link);
        },
        error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
      });
  }

  protected copy(link: ShareLink): void {
    navigator.clipboard.writeText(this.url(link)).then(
      () => {
        this.copied.set(true);
        setTimeout(() => this.copied.set(false), 2000);
      },
      () => this.notificationService.error('Não foi possível copiar; selecione o link e copie manualmente.')
    );
  }

  protected close(): void {
    this.closed.emit();
  }
}
