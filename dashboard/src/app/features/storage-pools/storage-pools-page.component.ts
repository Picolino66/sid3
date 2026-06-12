import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { toApiErrorMessage } from '../../core/api/api-error';
import { Connection } from '../connections/connection.models';
import { ConnectionsService } from '../connections/connections.service';
import { Project } from '../projects/project.models';
import { ProjectsService } from '../projects/projects.service';
import { StoragePool } from './storage-pool.models';
import { StoragePoolsService } from './storage-pools.service';

@Component({
  selector: 'sid3-storage-pools-page',
  imports: [ReactiveFormsModule],
  template: `
    <header class="topbar">
      <div>
        <h1>Pools de Armazenamento <span class="badge-advanced">Avançado</span></h1>
      </div>
    </header>

    <section class="split-layout">
      <form class="panel" [formGroup]="form" (ngSubmit)="createPool()">
        <header>
          <h2>Criar pool</h2>
          <p class="muted">Para distribuir uploads entre múltiplas contas Google Drive automaticamente.</p>
        </header>

        <label>
          Projeto
          <select [value]="selectedProjectId()" (change)="selectProject($event)">
            @for (project of projects(); track project.id) {
              <option [value]="project.id">{{ project.name }}</option>
            }
          </select>
        </label>

        <label>
          Nome do pool
          <input type="text" formControlName="name" placeholder="meu-pool" />
        </label>

        <label>
          Estratégia de roteamento
          <select formControlName="strategy">
            <option value="ROUND_ROBIN" title="Distribui igualmente entre os drives">Circular (Round Robin)</option>
            <option value="FILL_FIRST" title="Usa o drive com mais espaço livre">Preencher primeiro (Fill First)</option>
            <option value="WEIGHTED" title="Prioriza drives conforme peso configurado">Ponderado (Weighted)</option>
          </select>
        </label>
        <p class="field-hint">
          @if (form.controls.strategy.value === 'ROUND_ROBIN') { Distribui igualmente entre os drives. }
          @else if (form.controls.strategy.value === 'FILL_FIRST') { Usa o drive com mais espaço livre. }
          @else if (form.controls.strategy.value === 'WEIGHTED') { Prioriza drives conforme peso configurado. }
        </p>

        @if (errorMessage()) {
          <p class="form-error">{{ errorMessage() }}</p>
        }

        <button type="submit" [disabled]="form.invalid || isSubmitting() || !selectedProjectId()">
          {{ isSubmitting() ? 'Criando...' : 'Criar pool' }}
        </button>
      </form>

      <section class="panel">
        <header>
          <h2>{{ selectedProject()?.name ?? 'Pools do projeto' }}</h2>
        </header>

        @if (isLoading()) {
          <p class="muted">Carregando pools...</p>
        } @else if (pools().length === 0) {
          <p class="empty-state">Nenhum pool para este projeto. Crie o primeiro ao lado.</p>
        } @else {
          <div class="pool-list">
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
                  <p class="muted pool-empty">Nenhuma conexão adicionada.</p>
                } @else {
                  <div class="pool-members-table">
                    <div class="pool-members-head">
                      <span>Conexão</span>
                      <span>Conta</span>
                      <span>Status</span>
                      <span></span>
                    </div>
                    @for (member of pool.members; track member.id) {
                      <div class="pool-members-row">
                        <span>{{ member.displayName ?? 'Google Drive' }}</span>
                        <span class="muted">{{ member.providerAccountEmail ?? '—' }}</span>
                        <span>
                          <span [class]="'status-label ' + member.connectionStatus.toLowerCase()">
                            {{ member.connectionStatus === 'CONNECTED' ? 'Conectado' : member.connectionStatus === 'REVOKED' ? 'Revogado' : 'Erro' }}
                          </span>
                        </span>
                        <span>
                          <button class="danger compact-button" type="button" (click)="removeMember(pool, member.id)">
                            Remover
                          </button>
                        </span>
                      </div>
                    }
                  </div>
                }

                <div class="pool-add-member">
                  <select (change)="addMember(pool, $event)">
                    <option value="">+ Adicionar conexão ao pool</option>
                    @for (conn of availableConnections(pool); track conn.id) {
                      <option [value]="conn.id">{{ conn.displayName ?? 'Google Drive' }}{{ conn.providerAccountEmail ? ' — ' + conn.providerAccountEmail : '' }}</option>
                    }
                  </select>
                </div>
              </div>
            }
          </div>
        }
      </section>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StoragePoolsPageComponent {
  private readonly projectsService = inject(ProjectsService);
  private readonly connectionsService = inject(ConnectionsService);
  private readonly storagePoolsService = inject(StoragePoolsService);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly projects = signal<Project[]>([]);
  protected readonly connections = signal<Connection[]>([]);
  protected readonly pools = signal<StoragePool[]>([]);
  protected readonly selectedProjectId = signal('');
  protected readonly selectedProject = computed(() =>
    this.projects().find((p) => p.id === this.selectedProjectId())
  );
  protected readonly isLoading = signal(false);
  protected readonly isSubmitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(1), Validators.maxLength(100)]],
    strategy: ['ROUND_ROBIN']
  });

  protected strategyLabel(strategy: string): string {
    const labels: Record<string, string> = {
      ROUND_ROBIN: 'Circular',
      FILL_FIRST: 'Preencher primeiro',
      WEIGHTED: 'Ponderado'
    };
    return labels[strategy] ?? strategy;
  }

  protected availableConnections(pool: StoragePool): Connection[] {
    const memberConnectionIds = new Set(pool.members.map((m) => m.connectionId));
    return this.connections().filter((c) => c.status === 'CONNECTED' && !memberConnectionIds.has(c.id));
  }

  constructor() {
    this.loadInitialData();
  }

  selectProject(event: Event): void {
    const projectId = (event.target as HTMLSelectElement).value;
    this.selectedProjectId.set(projectId);
    this.loadPools(projectId);
  }

  createPool(): void {
    const projectId = this.selectedProjectId();
    if (!projectId || this.form.invalid || this.isSubmitting()) {
      return;
    }

    this.errorMessage.set(null);
    this.isSubmitting.set(true);
    const { name, strategy } = this.form.getRawValue();
    this.storagePoolsService
      .createPool(projectId, { name, strategy: strategy as StoragePool['strategy'] })
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: (pool) => {
          this.pools.update((pools) => [...pools, pool]);
          this.form.controls.name.reset();
        },
        error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
      });
  }

  deletePool(pool: StoragePool): void {
    this.storagePoolsService.deletePool(pool.id).subscribe({
      next: () => this.pools.update((pools) => pools.filter((p) => p.id !== pool.id)),
      error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
    });
  }

  addMember(pool: StoragePool, event: Event): void {
    const connectionId = (event.target as HTMLSelectElement).value;
    if (!connectionId) return;

    (event.target as HTMLSelectElement).value = '';

    this.storagePoolsService.addMember(pool.id, { connectionId }).subscribe({
      next: (member) => {
        this.pools.update((pools) =>
          pools.map((p) => (p.id === pool.id ? { ...p, members: [...p.members, member] } : p))
        );
      },
      error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
    });
  }

  removeMember(pool: StoragePool, memberId: string): void {
    this.storagePoolsService.removeMember(pool.id, memberId).subscribe({
      next: () => {
        this.pools.update((pools) =>
          pools.map((p) =>
            p.id === pool.id ? { ...p, members: p.members.filter((m) => m.id !== memberId) } : p
          )
        );
      },
      error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
    });
  }

  private loadInitialData(): void {
    this.connectionsService.listConnections().subscribe({
      next: (connections) => this.connections.set(connections),
      error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
    });

    this.projectsService.listProjects().subscribe({
      next: (projects) => {
        this.projects.set(projects);
        const first = projects.at(0);
        if (first) {
          this.selectedProjectId.set(first.id);
          this.loadPools(first.id);
        }
      },
      error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
    });
  }

  private loadPools(projectId: string): void {
    this.isLoading.set(true);
    this.storagePoolsService
      .listPools(projectId)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (pools) => this.pools.set(pools),
        error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
      });
  }
}
