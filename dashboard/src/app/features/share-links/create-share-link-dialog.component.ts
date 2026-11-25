import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { toApiErrorMessage } from '../../core/api/api-error';
import { NotificationService } from '../../core/notifications/notification.service';
import { ShareLink, shareLinkUrl } from './share-link.models';
import { ShareLinksService } from './share-links.service';

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
  imports: [ReactiveFormsModule],
  template: `
    <div class="modal-overlay" role="presentation" (click)="close()">
      <div
        class="modal-panel share-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-dialog-title"
        (click)="$event.stopPropagation()"
        (keydown.escape)="close()"
      >
        @if (createdLink(); as link) {
          <h3 id="share-dialog-title">Link público criado</h3>
          <p>Qualquer pessoa com este link pode ver e baixar os itens. Você pode desativá-lo em "Links compartilhados".</p>
          <div class="secret-box">
            <span>Link</span>
            <div class="secret-row">
              <code class="secret-value">{{ url(link) }}</code>
              <button class="compact-button" type="button" (click)="copy(link)">Copiar</button>
            </div>
          </div>
          <div class="modal-actions">
            <a class="button-link secondary-link" [href]="url(link)" target="_blank" rel="noopener">Abrir</a>
            <button type="button" (click)="close()">Concluir</button>
          </div>
        } @else {
          <h3 id="share-dialog-title">Gerar link público</h3>
          <p>
            {{ items().length }} {{ items().length === 1 ? 'item selecionado' : 'itens selecionados' }}.
            Pastas compartilhadas incluem todo o conteúdo delas.
          </p>
          <ul class="share-dialog-items">
            @for (item of previewItems(); track item.id) {
              <li>{{ item.isFolder ? '📁' : '📄' }} {{ item.name }}</li>
            }
            @if (items().length > previewItems().length) {
              <li class="muted">e mais {{ items().length - previewItems().length }}...</li>
            }
          </ul>

          <form [formGroup]="form" (ngSubmit)="submit()">
            <label>
              Nome do link (opcional)
              <input type="text" formControlName="name" maxlength="120" placeholder="Ex.: Fotos do evento" />
            </label>
            <label>
              Validade
              <select formControlName="expiresInDays">
                @for (option of expirationOptions; track option.value) {
                  <option [ngValue]="option.value">{{ option.label }}</option>
                }
              </select>
            </label>

            @if (errorMessage()) {
              <p class="form-error">{{ errorMessage() }}</p>
            }

            <div class="modal-actions">
              <button class="secondary" type="button" [disabled]="isSubmitting()" (click)="close()">Cancelar</button>
              <button type="submit" [disabled]="isSubmitting() || form.invalid">
                {{ isSubmitting() ? 'Gerando...' : 'Gerar link' }}
              </button>
            </div>
          </form>
        }
      </div>
    </div>
  `,
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
      () => this.notificationService.success('Link copiado!'),
      () => this.notificationService.error('Não foi possível copiar; selecione o link e copie manualmente.')
    );
  }

  protected close(): void {
    this.closed.emit();
  }
}
