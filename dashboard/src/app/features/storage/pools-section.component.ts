import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import { toApiErrorMessage } from '../../core/api/api-error';
import { NotificationService } from '../../core/notifications/notification.service';
import { ConfirmService } from '../../shared/ui/confirm.service';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { connectionStatusLabel, connectionStatusTone } from '../../shared/ui/format';
import { IconComponent } from '../../shared/ui/icon.component';
import { MenuComponent } from '../../shared/ui/menu.component';
import { ProjectConnection } from '../projects/project.models';
import { PoolRoutingStrategy, StoragePool } from '../storage-pools/storage-pool.models';
import { StoragePoolsService } from '../storage-pools/storage-pools.service';

const STRATEGY_LABELS: Record<PoolRoutingStrategy, string> = {
  ROUND_ROBIN: 'Alternar entre contas',
  FILL_FIRST: 'Encher uma conta por vez',
  WEIGHTED: 'Proporcional ao peso'
};

/** Pools (avançado): distribuem os envios de um bucket entre várias contas do projeto. */
@Component({
  selector: 'sid3-pools-section',
  imports: [ReactiveFormsModule, FieldErrorComponent, IconComponent, MenuComponent],
  template: `
    <details class="card disclosure" [open]="pools().length > 0">
      <summary>
        <div>
          <h2 class="card__title cluster" style="gap: var(--space-2)">Pools de armazenamento <span class="tag">Avançado</span></h2>
          <p class="card__desc">Distribua os envios de um bucket entre várias contas do projeto.</p>
        </div>
        <sid3-icon class="disclosure__chev" name="chev" />
      </summary>

      <div class="card__body stack-sm">
        @for (pool of pools(); track pool.id) {
          <article class="pool">
            <header class="pool__header">
              <div class="cluster" style="gap: var(--space-2); min-width: 0">
                <strong class="truncate">{{ pool.name }}</strong>
                <span class="chip chip--neutral">{{ strategyLabel(pool.strategy) }}</span>
              </div>
              <div class="cluster" style="gap: var(--space-1)">
                @if (availableFor(pool).length > 0) {
                  <sid3-menu text="Adicionar conta" [icon]="null" label="Adicionar conta ao pool" triggerClass="btn btn--sm btn--ghost">
                    @for (connection of availableFor(pool); track connection.connectionId) {
                      <button class="menu-item" type="button" role="menuitem" (click)="addMember(pool, connection.connectionId)">
                        <sid3-icon name="drive" />{{ connection.displayName ?? 'Google Drive' }}
                      </button>
                    }
                  </sid3-menu>
                }
                <sid3-menu [label]="'Ações do pool ' + pool.name">
                  <button class="menu-item menu-item--danger" type="button" role="menuitem" (click)="deletePool(pool)"><sid3-icon name="trash" />Excluir pool</button>
                </sid3-menu>
              </div>
            </header>
            @if (pool.members.length === 0) {
              <p class="muted text-sm pool__empty">Nenhuma conta no pool. Use "Adicionar conta" para incluir contas do projeto.</p>
            } @else {
              <ul class="row-list">
                @for (member of pool.members; track member.id) {
                  <li class="row-item">
                    <div class="row-item__main">
                      <strong class="truncate">{{ member.displayName ?? 'Google Drive' }}</strong>
                      <span class="row-item__meta truncate">{{ member.providerAccountEmail ?? '—' }}</span>
                    </div>
                    <div class="row-item__aside">
                      <span [class]="'chip chip--' + statusTone(member.connectionStatus)">{{ statusLabel(member.connectionStatus) }}</span>
                      <button
                        class="btn btn--ghost btn--icon btn--sm"
                        type="button"
                        [attr.aria-label]="'Remover ' + (member.displayName ?? 'conta') + ' do pool'"
                        data-tooltip="Remover do pool"
                        data-tooltip-pos="left"
                        (click)="removeMember(pool, member.id)"
                      >
                        <sid3-icon name="x" />
                      </button>
                    </div>
                  </li>
                }
              </ul>
            }
          </article>
        }

        <form class="inline-form" [formGroup]="form" (ngSubmit)="createPool()" novalidate>
          <div class="field">
            <label class="field__label" for="pool-name">Nome do novo pool</label>
            <input id="pool-name" class="input input--sm" formControlName="name" placeholder="Ex.: rotativo" aria-describedby="pool-name-error" />
            <sid3-field-error id="pool-name-error" [control]="form.controls.name" [messages]="{ required: 'Dê um nome ao pool.', minlength: 'Use pelo menos 2 caracteres.' }" />
          </div>
          <div class="field">
            <label class="field__label" for="pool-strategy">Estratégia</label>
            <select id="pool-strategy" class="select select--sm" formControlName="strategy">
              @for (strategy of strategies; track strategy) {
                <option [value]="strategy">{{ strategyLabel(strategy) }}</option>
              }
            </select>
          </div>
          <button class="btn btn--sm" type="submit" [disabled]="isSubmitting()">
            <sid3-icon [name]="isSubmitting() ? 'loader' : 'plus'" [spin]="isSubmitting()" />Criar pool
          </button>
        </form>
      </div>
    </details>
  `,
  styles: [
    `
      .pool { border: 1px solid var(--color-line); border-radius: var(--radius-md); overflow: hidden; }
      .pool__header { align-items: center; background: var(--color-soft); display: flex; flex-wrap: wrap; gap: var(--space-2); justify-content: space-between; padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4); }
      .pool__empty { padding: var(--space-3) var(--space-4); }
      .pool .row-item { padding-left: var(--space-4); padding-right: var(--space-2); }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PoolsSectionComponent {
  private readonly storagePoolsService = inject(StoragePoolsService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly notifications = inject(NotificationService);
  private readonly confirm = inject(ConfirmService);

  readonly projectId = input.required<string>();
  readonly pools = input.required<StoragePool[]>();
  readonly connections = input.required<ProjectConnection[]>();
  readonly changed = output<void>();

  protected readonly strategies = Object.keys(STRATEGY_LABELS) as PoolRoutingStrategy[];
  protected readonly statusTone = connectionStatusTone;
  protected readonly isSubmitting = signal(false);
  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    strategy: ['ROUND_ROBIN' as PoolRoutingStrategy, Validators.required]
  });

  protected strategyLabel(strategy: PoolRoutingStrategy): string {
    return STRATEGY_LABELS[strategy] ?? strategy;
  }

  protected statusLabel(status: 'CONNECTED' | 'REVOKED' | 'ERROR'): string {
    return connectionStatusLabel(status);
  }

  protected availableFor(pool: StoragePool): ProjectConnection[] {
    const memberIds = new Set(pool.members.map((member) => member.connectionId));
    return this.connections().filter((connection) => connection.status === 'CONNECTED' && !memberIds.has(connection.connectionId));
  }

  createPool(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.isSubmitting()) return;
    const { name, strategy } = this.form.getRawValue();
    this.isSubmitting.set(true);
    this.execute(
      this.storagePoolsService.createPool(this.projectId(), { name: name.trim(), strategy }),
      `Pool "${name.trim()}" criado.`,
      () => this.form.reset({ name: '', strategy: 'ROUND_ROBIN' }),
      () => this.isSubmitting.set(false)
    );
  }

  async deletePool(pool: StoragePool): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: `Excluir o pool "${pool.name}"?`,
      message: 'Buckets que usam este pool precisam de outro destino para novos envios.',
      confirmLabel: 'Excluir pool'
    });
    if (!confirmed) return;
    this.execute(this.storagePoolsService.deletePool(pool.id), `Pool "${pool.name}" excluído.`);
  }

  addMember(pool: StoragePool, connectionId: string): void {
    if (!connectionId) return;
    this.execute(this.storagePoolsService.addMember(pool.id, { connectionId }), 'Conta adicionada ao pool.');
  }

  removeMember(pool: StoragePool, memberId: string): void {
    this.execute(this.storagePoolsService.removeMember(pool.id, memberId), 'Conta removida do pool.');
  }

  private execute(request: Observable<unknown>, successMessage: string, done?: () => void, always?: () => void): void {
    request.subscribe({
      next: () => {
        always?.();
        done?.();
        this.notifications.success(successMessage);
        this.changed.emit();
      },
      error: (error: unknown) => {
        always?.();
        this.notifications.error(toApiErrorMessage(error));
      }
    });
  }
}
