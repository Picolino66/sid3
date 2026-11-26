import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import { toApiErrorMessage } from '../../core/api/api-error';
import { connectionStatusLabel } from '../../shared/ui/format';
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
  imports: [ReactiveFormsModule],
  template: `
    <details class="panel advanced-panel" [open]="pools().length > 0">
      <summary>
        <h2>Pools de armazenamento <span class="badge-advanced">Avançado</span></h2>
        <span class="muted">Distribua os envios de um bucket entre várias contas do projeto.</span>
      </summary>

      @if (errorMessage()) {
        <p class="form-error">{{ errorMessage() }}</p>
      }

      @for (pool of pools(); track pool.id) {
        <div class="pool-card">
          <div class="pool-card-header">
            <div class="pool-card-title">
              <strong>{{ pool.name }}</strong>
              <span class="pool-strategy-label">{{ strategyLabel(pool.strategy) }}</span>
            </div>
            <button class="danger compact-button" type="button" (click)="deletePool(pool)">Excluir</button>
          </div>
          @if (pool.members.length === 0) {
            <p class="muted pool-empty">Nenhuma conta no pool.</p>
          } @else {
            <ul class="row-list">
              @for (member of pool.members; track member.id) {
                <li class="row-item">
                  <div class="row-main">
                    <strong>{{ member.displayName ?? 'GOOGLE_DRIVE' }}</strong>
                    <span class="muted">{{ member.providerAccountEmail ?? '—' }}</span>
                  </div>
                  <span [class]="'status-label ' + member.connectionStatus.toLowerCase()">{{ statusLabel(member.connectionStatus) }}</span>
                  <button class="secondary compact-button" type="button" (click)="removeMember(pool, member.id)">Remover</button>
                </li>
              }
            </ul>
          }
          <select class="pool-add-member" (change)="addMember(pool, $any($event.target))" aria-label="Adicionar conta ao pool">
            <option value="">+ Adicionar conta do projeto ao pool</option>
            @for (connection of availableFor(pool); track connection.connectionId) {
              <option [value]="connection.connectionId">{{ connection.displayName ?? 'GOOGLE_DRIVE' }}</option>
            }
          </select>
        </div>
      }

      <form class="inline-form" [formGroup]="form" (ngSubmit)="createPool()">
        <input formControlName="name" placeholder="Nome do pool" aria-label="Nome do novo pool" />
        <select formControlName="strategy" aria-label="Estratégia do pool">
          @for (strategy of strategies; track strategy) {
            <option [value]="strategy">{{ strategyLabel(strategy) }}</option>
          }
        </select>
        <button type="submit" [disabled]="form.invalid">Criar pool</button>
      </form>
    </details>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PoolsSectionComponent {
  private readonly storagePoolsService = inject(StoragePoolsService);
  private readonly formBuilder = inject(FormBuilder);

  readonly projectId = input.required<string>();
  readonly pools = input.required<StoragePool[]>();
  readonly connections = input.required<ProjectConnection[]>();
  readonly changed = output<void>();

  protected readonly strategies = Object.keys(STRATEGY_LABELS) as PoolRoutingStrategy[];
  protected readonly errorMessage = signal<string | null>(null);
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
    const { name, strategy } = this.form.getRawValue();
    this.execute(this.storagePoolsService.createPool(this.projectId(), { name: name.trim(), strategy }), () =>
      this.form.controls.name.reset('')
    );
  }

  deletePool(pool: StoragePool): void {
    if (!window.confirm(`Excluir o pool "${pool.name}"?`)) return;
    this.execute(this.storagePoolsService.deletePool(pool.id));
  }

  addMember(pool: StoragePool, select: HTMLSelectElement): void {
    const connectionId = select.value;
    select.value = '';
    if (!connectionId) return;
    this.execute(this.storagePoolsService.addMember(pool.id, { connectionId }));
  }

  removeMember(pool: StoragePool, memberId: string): void {
    this.execute(this.storagePoolsService.removeMember(pool.id, memberId));
  }

  private execute(request: Observable<unknown>, done?: () => void): void {
    this.errorMessage.set(null);
    request.subscribe({
      next: () => {
        done?.();
        this.changed.emit();
      },
      error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
    });
  }
}
