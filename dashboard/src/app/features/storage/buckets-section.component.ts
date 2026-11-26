import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import { toApiErrorMessage } from '../../core/api/api-error';
import { NotificationService } from '../../core/notifications/notification.service';
import { ConfirmService } from '../../shared/ui/confirm.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { plural } from '../../shared/ui/format';
import { IconComponent } from '../../shared/ui/icon.component';
import { MenuComponent } from '../../shared/ui/menu.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { Bucket } from '../buckets/bucket.models';
import { BucketsService } from '../buckets/buckets.service';
import { ProjectConnection } from '../projects/project.models';
import { StoragePool } from '../storage-pools/storage-pool.models';

type DestinationOption = { value: string; label: string };

const BUCKET_NAME_MESSAGES = {
  required: 'Dê um nome ao bucket.',
  pattern: 'Use de 3 a 63 caracteres: letras minúsculas, números e hífen (começando por letra ou número).'
};

/** Buckets do projeto: criar, renomear, trocar o destino dos próximos envios e excluir os vazios. */
@Component({
  selector: 'sid3-buckets-section',
  imports: [ReactiveFormsModule, EmptyStateComponent, FieldErrorComponent, IconComponent, MenuComponent, ModalComponent],
  template: `
    <section class="card">
      <header class="card__header">
        <div>
          <h2 class="card__title">Buckets</h2>
          <p class="card__desc">Cada bucket vira uma pasta dentro de "sid3" na conta escolhida.</p>
        </div>
        <button class="btn btn--sm btn--primary" type="button" [disabled]="destinations().length === 0" (click)="openCreate()">
          <sid3-icon name="plus" />Novo bucket
        </button>
      </header>

      @if (buckets().length === 0) {
        <sid3-empty-state
          icon="folder"
          title="Nenhum bucket ainda"
          [description]="
            destinations().length === 0
              ? 'Adicione uma conta do Drive ao projeto (acima) para poder criar buckets.'
              : 'Crie um bucket para começar a receber arquivos.'
          "
          [compact]="true"
        >
          @if (destinations().length > 0) {
            <button class="btn btn--sm btn--primary" type="button" (click)="openCreate()"><sid3-icon name="plus" />Novo bucket</button>
          }
        </sid3-empty-state>
      } @else {
        <ul class="row-list" style="margin-top: var(--space-3)">
          @for (bucket of buckets(); track bucket.id) {
            <li class="row-item">
              <span class="row-item__avatar" aria-hidden="true"><sid3-icon name="folder" /></span>
              <div class="row-item__main">
                <strong class="truncate mono">{{ bucket.name }}</strong>
                <span class="row-item__meta">{{ plural(bucket.objectCount, 'arquivo', 'arquivos') }}</span>
              </div>
              <label class="field destination">
                <span class="field__hint">Destino dos novos envios</span>
                <select class="select select--sm" [value]="destinationValue(bucket)" (change)="changeDestination(bucket, $any($event.target))">
                  @if (!hasDestinationOption(bucket)) {
                    <option [value]="destinationValue(bucket)" selected>Conexão fora do projeto</option>
                  }
                  @for (option of destinations(); track option.value) {
                    <option [value]="option.value" [selected]="option.value === destinationValue(bucket)">{{ option.label }}</option>
                  }
                </select>
              </label>
              <sid3-menu [label]="'Ações do bucket ' + bucket.name">
                <button class="menu-item" type="button" role="menuitem" (click)="openRename(bucket)"><sid3-icon name="pencil" />Renomear</button>
                <hr class="menu-sep" />
                <button class="menu-item menu-item--danger" type="button" role="menuitem" [disabled]="bucket.objectCount > 0" (click)="remove(bucket)">
                  <sid3-icon name="trash" />{{ bucket.objectCount > 0 ? 'Excluir (só se estiver vazio)' : 'Excluir bucket' }}
                </button>
              </sid3-menu>
            </li>
          }
        </ul>
      }
    </section>

    @if (dialog(); as mode) {
      <sid3-modal [title]="mode === 'create' ? 'Novo bucket' : 'Renomear bucket'" [dismissable]="!isSubmitting()" (closed)="closeDialog()">
        <form id="bucket-form" class="stack-sm" [formGroup]="form" (ngSubmit)="submitDialog()">
          <div class="field">
            <label class="field__label" for="bucket-name">Nome<span class="field__req" aria-hidden="true">*</span></label>
            <input id="bucket-name" class="input mono" formControlName="name" placeholder="fotos-2024" autocomplete="off" data-autofocus aria-describedby="bucket-name-hint bucket-name-error" />
            <span class="field__hint" id="bucket-name-hint">Letras minúsculas, números e hífen, de 3 a 63 caracteres.</span>
            <sid3-field-error id="bucket-name-error" [control]="form.controls.name" [messages]="nameMessages" />
          </div>
          @if (mode === 'create') {
            <div class="field">
              <label class="field__label" for="bucket-destination">Destino dos envios</label>
              <select id="bucket-destination" class="select" formControlName="destination">
                @for (option of destinations(); track option.value) {
                  <option [value]="option.value">{{ option.label }}</option>
                }
              </select>
              <span class="field__hint">Conta do Drive (ou pool) onde os arquivos deste bucket serão gravados.</span>
            </div>
          }
        </form>
        <footer modal-footer class="modal__footer">
          <button class="btn" type="button" [disabled]="isSubmitting()" (click)="closeDialog()">Cancelar</button>
          <button class="btn btn--primary" type="submit" form="bucket-form" [disabled]="isSubmitting()">
            @if (isSubmitting()) {
              <sid3-icon name="loader" [spin]="true" />
            }
            {{ mode === 'create' ? 'Criar bucket' : 'Salvar' }}
          </button>
        </footer>
      </sid3-modal>
    }
  `,
  styles: ['.destination { flex: 0 1 260px; gap: 2px; } @media (max-width: 640px) { .destination { flex-basis: 100%; } }'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BucketsSectionComponent {
  private readonly bucketsService = inject(BucketsService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly notifications = inject(NotificationService);
  private readonly confirm = inject(ConfirmService);

  readonly projectId = input.required<string>();
  readonly buckets = input.required<Bucket[]>();
  readonly connections = input.required<ProjectConnection[]>();
  readonly pools = input.required<StoragePool[]>();
  readonly changed = output<void>();

  protected readonly plural = plural;
  protected readonly nameMessages = BUCKET_NAME_MESSAGES;
  protected readonly isSubmitting = signal(false);
  protected readonly dialog = signal<'create' | 'rename' | null>(null);
  private renaming: Bucket | null = null;
  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.pattern(/^[a-z0-9][a-z0-9-]{2,62}$/)]],
    destination: ['', Validators.required]
  });

  protected readonly destinations = computed<DestinationOption[]>(() => [
    ...this.connections()
      .filter((connection) => connection.status === 'CONNECTED')
      .map((connection) => ({
        value: `conn:${connection.connectionId}`,
        label: `${connection.displayName ?? 'Google Drive'}${connection.providerAccountEmail ? ' — ' + connection.providerAccountEmail : ''}`
      })),
    ...this.pools()
      .filter((pool) => pool.members.length > 0)
      .map((pool) => ({ value: `pool:${pool.id}`, label: `Pool: ${pool.name}` }))
  ]);

  protected destinationValue(bucket: Bucket): string {
    return bucket.storagePoolId ? `pool:${bucket.storagePoolId}` : `conn:${bucket.providerIntegrationId}`;
  }

  protected hasDestinationOption(bucket: Bucket): boolean {
    return this.destinations().some((option) => option.value === this.destinationValue(bucket));
  }

  openCreate(): void {
    this.renaming = null;
    this.form.reset({ name: '', destination: this.destinations()[0]?.value ?? '' });
    this.dialog.set('create');
  }

  openRename(bucket: Bucket): void {
    this.renaming = bucket;
    this.form.reset({ name: bucket.name, destination: this.destinationValue(bucket) });
    this.dialog.set('rename');
  }

  closeDialog(): void {
    if (this.isSubmitting()) return;
    this.dialog.set(null);
  }

  submitDialog(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.dialog() === 'rename' && this.renaming) {
      this.rename(this.renaming, this.form.getRawValue().name);
    } else {
      this.create();
    }
  }

  create(): void {
    if (this.form.invalid || this.isSubmitting()) return;
    const { name, destination } = this.form.getRawValue();
    this.isSubmitting.set(true);
    this.execute(this.bucketsService.createBucket(this.projectId(), { name, ...this.toDestination(destination) }), `Bucket "${name}" criado.`, () => {
      this.isSubmitting.set(false);
    });
  }

  rename(bucket: Bucket, rawName: string): void {
    const name = rawName.trim();
    if (!name || name === bucket.name) {
      this.dialog.set(null);
      return;
    }
    this.isSubmitting.set(true);
    this.execute(this.bucketsService.updateBucket(this.projectId(), bucket.id, { name }), 'Bucket renomeado.', () => this.isSubmitting.set(false));
  }

  async changeDestination(bucket: Bucket, select: HTMLSelectElement): Promise<void> {
    const destination = select.value;
    if (destination === this.destinationValue(bucket)) return;
    const label = this.destinations().find((option) => option.value === destination)?.label ?? 'o novo destino';
    const confirmed = await this.confirm.ask({
      title: `Mudar o destino de "${bucket.name}"?`,
      message: `Os próximos envios irão para ${label}. Os arquivos já enviados continuam onde estão.`,
      confirmLabel: 'Mudar destino',
      tone: 'default'
    });
    if (!confirmed) {
      select.value = this.destinationValue(bucket);
      return;
    }
    this.execute(this.bucketsService.updateBucket(this.projectId(), bucket.id, this.toDestination(destination)), 'Destino atualizado.', undefined, () => {
      select.value = this.destinationValue(bucket);
    });
  }

  async remove(bucket: Bucket): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: `Excluir o bucket "${bucket.name}"?`,
      message: 'O bucket está vazio. A pasta dele deixa de ser usada pelo SID3.',
      confirmLabel: 'Excluir bucket'
    });
    if (!confirmed) return;
    this.execute(this.bucketsService.deleteBucket(this.projectId(), bucket.id), `Bucket "${bucket.name}" excluído.`);
  }

  private toDestination(value: string): { providerIntegrationId?: string; storagePoolId?: string } {
    const [kind, id] = value.split(':');
    return kind === 'pool' ? { storagePoolId: id } : { providerIntegrationId: id };
  }

  private execute(request: Observable<unknown>, successMessage: string, done?: () => void, failed?: () => void): void {
    request.subscribe({
      next: () => {
        done?.();
        this.dialog.set(null);
        this.notifications.success(successMessage);
        this.changed.emit();
      },
      error: (error: unknown) => {
        done?.();
        failed?.();
        this.notifications.error(toApiErrorMessage(error));
      }
    });
  }
}
