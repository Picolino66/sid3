import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import { toApiErrorMessage } from '../../core/api/api-error';
import { formatCount } from '../../shared/ui/format';
import { Bucket } from '../buckets/bucket.models';
import { BucketsService } from '../buckets/buckets.service';
import { ProjectConnection } from '../projects/project.models';
import { StoragePool } from '../storage-pools/storage-pool.models';

type DestinationOption = { value: string; label: string };

/** Buckets do projeto: criar, renomear, trocar o destino dos próximos envios e excluir os vazios. */
@Component({
  selector: 'sid3-buckets-section',
  imports: [ReactiveFormsModule],
  template: `
    <section class="panel">
      <header class="panel-header-row">
        <div>
          <h2>Buckets</h2>
          <p class="muted">Cada bucket vira uma pasta dentro de "sid3" na conta escolhida.</p>
        </div>
      </header>

      @if (errorMessage()) {
        <p class="form-error">{{ errorMessage() }}</p>
      }

      @if (buckets().length === 0) {
        <p class="empty-state">Nenhum bucket neste projeto.</p>
      } @else {
        <ul class="row-list">
          @for (bucket of buckets(); track bucket.id) {
            <li class="row-item bucket-row">
              <div class="row-main">
                @if (renamingId() === bucket.id) {
                  <input
                    class="inline-edit"
                    [value]="bucket.name"
                    aria-label="Novo nome do bucket"
                    (keydown.enter)="rename(bucket, $any($event.target).value)"
                    (keydown.escape)="renamingId.set(null)"
                    (blur)="rename(bucket, $any($event.target).value)"
                  />
                } @else {
                  <strong>{{ bucket.name }}</strong>
                }
                <span class="muted">{{ count(bucket.objectCount) }} arquivo(s)</span>
              </div>
              <label class="destination-picker">
                <span class="muted">Destino dos novos envios</span>
                <select [value]="destinationValue(bucket)" (change)="changeDestination(bucket, $any($event.target).value)">
                  @if (!hasDestinationOption(bucket)) {
                    <option [value]="destinationValue(bucket)">Conexão fora do projeto</option>
                  }
                  @for (option of destinations(); track option.value) {
                    <option [value]="option.value">{{ option.label }}</option>
                  }
                </select>
              </label>
              <div class="row-actions">
                <button class="secondary compact-button" type="button" (click)="renamingId.set(bucket.id)">Renomear</button>
                <button
                  class="danger compact-button"
                  type="button"
                  [disabled]="bucket.objectCount > 0"
                  [title]="bucket.objectCount > 0 ? 'Só é possível excluir buckets vazios' : 'Excluir bucket'"
                  (click)="remove(bucket)"
                >
                  Excluir
                </button>
              </div>
            </li>
          }
        </ul>
      }

      <form class="inline-form" [formGroup]="form" (ngSubmit)="create()">
        <input formControlName="name" placeholder="nome-do-bucket" aria-label="Nome do novo bucket" />
        <select formControlName="destination" aria-label="Destino do novo bucket">
          @for (option of destinations(); track option.value) {
            <option [value]="option.value">{{ option.label }}</option>
          }
        </select>
        <button type="submit" [disabled]="form.invalid || destinations().length === 0 || isSubmitting()">
          {{ isSubmitting() ? 'Criando...' : 'Criar bucket' }}
        </button>
      </form>
      @if (destinations().length === 0) {
        <p class="field-hint">Adicione uma conta do Drive ao projeto para poder criar buckets.</p>
      } @else {
        <p class="field-hint">Use letras minúsculas, números e hífen (3 a 63 caracteres).</p>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BucketsSectionComponent {
  private readonly bucketsService = inject(BucketsService);
  private readonly formBuilder = inject(FormBuilder);

  readonly projectId = input.required<string>();
  readonly buckets = input.required<Bucket[]>();
  readonly connections = input.required<ProjectConnection[]>();
  readonly pools = input.required<StoragePool[]>();
  readonly changed = output<void>();

  protected readonly renamingId = signal<string | null>(null);
  protected readonly isSubmitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.pattern(/^[a-z0-9][a-z0-9-]{2,62}$/)]],
    destination: ['', Validators.required]
  });

  protected readonly destinations = computed<DestinationOption[]>(() => {
    const options = [
      ...this.connections()
        .filter((connection) => connection.status === 'CONNECTED')
        .map((connection) => ({
          value: `conn:${connection.connectionId}`,
          label: `${connection.displayName ?? 'GOOGLE_DRIVE'}${connection.providerAccountEmail ? ' — ' + connection.providerAccountEmail : ''}`
        })),
      ...this.pools()
        .filter((pool) => pool.members.length > 0)
        .map((pool) => ({ value: `pool:${pool.id}`, label: `Pool: ${pool.name}` }))
    ];
    if (!this.form.controls.destination.value && options[0]) {
      queueMicrotask(() => this.form.controls.destination.setValue(options[0]!.value));
    }
    return options;
  });

  protected count(value: number): string {
    return formatCount(value);
  }

  protected destinationValue(bucket: Bucket): string {
    return bucket.storagePoolId ? `pool:${bucket.storagePoolId}` : `conn:${bucket.providerIntegrationId}`;
  }

  protected hasDestinationOption(bucket: Bucket): boolean {
    return this.destinations().some((option) => option.value === this.destinationValue(bucket));
  }

  create(): void {
    if (this.form.invalid) return;
    const { name, destination } = this.form.getRawValue();
    this.isSubmitting.set(true);
    this.execute(this.bucketsService.createBucket(this.projectId(), { name, ...this.toDestination(destination) }), () => {
      this.isSubmitting.set(false);
      this.form.controls.name.reset('');
    });
  }

  rename(bucket: Bucket, rawName: string): void {
    this.renamingId.set(null);
    const name = rawName.trim();
    if (!name || name === bucket.name) return;
    this.execute(this.bucketsService.updateBucket(this.projectId(), bucket.id, { name }));
  }

  changeDestination(bucket: Bucket, destination: string): void {
    if (destination === this.destinationValue(bucket)) return;
    const confirmed = window.confirm(
      `Os próximos envios do bucket "${bucket.name}" irão para o novo destino. Os arquivos já enviados continuam onde estão. Confirmar?`
    );
    if (!confirmed) {
      this.changed.emit();
      return;
    }
    this.execute(this.bucketsService.updateBucket(this.projectId(), bucket.id, this.toDestination(destination)));
  }

  remove(bucket: Bucket): void {
    if (!window.confirm(`Excluir o bucket vazio "${bucket.name}"?`)) return;
    this.execute(this.bucketsService.deleteBucket(this.projectId(), bucket.id));
  }

  private toDestination(value: string): { providerIntegrationId?: string; storagePoolId?: string } {
    const [kind, id] = value.split(':');
    return kind === 'pool' ? { storagePoolId: id } : { providerIntegrationId: id };
  }

  private execute(request: Observable<unknown>, done?: () => void): void {
    this.errorMessage.set(null);
    request.subscribe({
      next: () => {
        done?.();
        this.changed.emit();
      },
      error: (error: unknown) => {
        done?.();
        this.errorMessage.set(toApiErrorMessage(error));
      }
    });
  }
}
