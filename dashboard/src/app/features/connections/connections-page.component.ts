import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { toApiErrorDetails, toApiErrorMessage } from '../../core/api/api-error';
import { NotificationService } from '../../core/notifications/notification.service';
import { ConfirmService } from '../../shared/ui/confirm.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { ErrorStateComponent } from '../../shared/ui/error-state.component';
import { connectionStatusLabel, connectionStatusTone, initials, plural } from '../../shared/ui/format';
import { IconComponent } from '../../shared/ui/icon.component';
import { MenuComponent } from '../../shared/ui/menu.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { SkeletonComponent } from '../../shared/ui/skeleton.component';
import { matchesQuery, TableSort } from '../../shared/ui/table-sort';
import { Connection, DEFAULT_CONNECTION_DISPLAY_NAME, Sid3RootFolderDecision } from './connection.models';
import { ConnectionsService } from './connections.service';

type ConnectionSortKey = 'name' | 'status' | 'createdAt';

@Component({
  selector: 'sid3-connections-page',
  imports: [
    DatePipe,
    EmptyStateComponent,
    ErrorStateComponent,
    IconComponent,
    MenuComponent,
    ModalComponent,
    PageHeaderComponent,
    SkeletonComponent
  ],
  template: `
    <sid3-page-header
      title="Conexões"
      description="Contas do Google Drive conectadas ao SID3. Para usar uma conta num projeto, adicione-a em Armazenamento; a mesma conta pode estar em vários projetos."
    >
      <button class="btn btn--primary" type="button" [disabled]="isConnecting()" (click)="openConnectDialog()">
        <sid3-icon name="plus" />Conectar Google Drive
      </button>
    </sid3-page-header>

    <section class="card">
      @if (isLoading() && connections().length === 0) {
        <sid3-skeleton [count]="3" label="Carregando conexões" />
      } @else if (loadError(); as failure) {
        <sid3-error-state
          title="Não foi possível carregar as conexões"
          [message]="failure.message"
          [details]="failure.details"
          [busy]="isLoading()"
          (retry)="loadConnections()"
        />
      } @else if (connections().length === 0) {
        <sid3-empty-state
          icon="plug"
          title="Nenhuma conta conectada"
          description="Conecte uma conta do Google Drive para começar a guardar arquivos pelo SID3."
        >
          <button class="btn btn--primary" type="button" (click)="openConnectDialog()"><sid3-icon name="plus" />Conectar Google Drive</button>
        </sid3-empty-state>
      } @else {
        <div class="toolbar">
          <div class="toolbar__group">
            <label class="input-icon toolbar__search">
              <span class="sr-only">Buscar conexão</span>
              <sid3-icon name="search" />
              <input class="input input--sm" type="search" placeholder="Buscar por nome ou e-mail" [value]="query()" (input)="query.set($any($event.target).value)" />
            </label>
            @if (attentionCount() > 0) {
              <button class="filter-chip" type="button" [attr.aria-pressed]="onlyAttention()" (click)="onlyAttention.set(!onlyAttention())">
                <sid3-icon name="alert" size="sm" />Precisam de atenção ({{ attentionCount() }})
              </button>
            }
          </div>
          <span class="muted text-sm">{{ plural(connections().length, 'conta', 'contas') }}</span>
        </div>
        <div class="table-wrap">
          <table class="table table--responsive">
            <thead>
              <tr>
                <th [attr.aria-sort]="sort.aria('name')">
                  <button class="sort-btn" type="button" (click)="sort.toggle('name')">Conta <sid3-icon [name]="sort.icon('name')" size="sm" /></button>
                </th>
                <th>Projetos</th>
                <th [attr.aria-sort]="sort.aria('status')">
                  <button class="sort-btn" type="button" (click)="sort.toggle('status')">Status <sid3-icon [name]="sort.icon('status')" size="sm" /></button>
                </th>
                <th [attr.aria-sort]="sort.aria('createdAt')">
                  <button class="sort-btn" type="button" (click)="sort.toggle('createdAt')">Conectada em <sid3-icon [name]="sort.icon('createdAt')" size="sm" /></button>
                </th>
                <th class="col-actions"><span class="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              @for (connection of visibleConnections(); track connection.id) {
                <tr>
                  <td class="cell-primary">
                    <div class="cluster" style="flex-wrap: nowrap">
                      <span class="row-item__avatar" aria-hidden="true">{{ initials(connection.displayName ?? connection.providerAccountEmail) }}</span>
                      @if (editingId() === connection.id) {
                        <form class="input-group" style="max-width: 280px" (submit)="$event.preventDefault(); saveDisplayName(connection)">
                          <input
                            class="input input--sm"
                            type="text"
                            maxlength="100"
                            aria-label="Novo nome da conexão"
                            data-autofocus
                            [value]="editingName()"
                            (input)="editingName.set($any($event.target).value)"
                            (keydown.escape)="cancelEdit()"
                          />
                          <button class="btn btn--sm btn--icon" type="submit" aria-label="Salvar nome"><sid3-icon name="check" /></button>
                          <button class="btn btn--sm btn--icon" type="button" aria-label="Cancelar" (click)="cancelEdit()"><sid3-icon name="x" /></button>
                        </form>
                      } @else {
                        <div class="cell-main">
                          <strong class="truncate">{{ connection.displayName ?? 'Google Drive' }}</strong>
                          <span class="truncate">{{ connection.providerAccountEmail ?? 'Conta ainda não identificada' }}</span>
                        </div>
                      }
                    </div>
                  </td>
                  <td data-label="Projetos">
                    @if (connection.projects.length === 0) {
                      <span class="muted">Nenhum</span>
                    } @else {
                      <span [title]="projectNames(connection)">{{ projectNames(connection) }}</span>
                    }
                  </td>
                  <td data-label="Status">
                    <div class="stack-sm" style="gap: 4px; justify-items: start">
                      <div class="cluster" style="gap: 4px">
                        <span [class]="'chip chip--' + statusTone(connection.status)">{{ statusLabel(connection.status) }}</span>
                        @if (connection.sid3RootFolderStatus === 'PENDING_CONFIRMATION') {
                          <span class="chip chip--warn">Pasta sid3 pendente</span>
                        }
                      </div>
                      @if (connection.status === 'ERROR' && connection.lastError) {
                        <span class="text-xs text-danger">{{ errorLabel(connection.lastError) }}</span>
                      }
                    </div>
                  </td>
                  <td class="col-date" data-label="Conectada em">{{ connection.createdAt | date: 'dd/MM/yyyy' }}</td>
                  <td class="col-actions">
                    <div class="cell-actions">
                      @if (connection.sid3RootFolderStatus === 'PENDING_CONFIRMATION') {
                        <button class="btn btn--sm" type="button" (click)="openSid3RootDialog(connection)">Resolver pasta</button>
                      } @else if (connection.status !== 'CONNECTED') {
                        <button class="btn btn--sm" type="button" [disabled]="reauthorizingId() === connection.id" (click)="reauthorize(connection)">
                          <sid3-icon name="refresh" [spin]="reauthorizingId() === connection.id" />
                          {{ reauthorizingId() === connection.id ? 'Redirecionando...' : 'Reconectar' }}
                        </button>
                      }
                      <sid3-menu [label]="'Ações de ' + (connection.displayName ?? 'Google Drive')">
                        <button class="menu-item" type="button" role="menuitem" (click)="startEdit(connection)"><sid3-icon name="pencil" />Renomear</button>
                        @if (connection.status === 'CONNECTED') {
                          <button class="menu-item" type="button" role="menuitem" (click)="reauthorize(connection)"><sid3-icon name="refresh" />Reconectar</button>
                        }
                        @if (connection.status !== 'REVOKED') {
                          <button class="menu-item" type="button" role="menuitem" (click)="revoke(connection)"><sid3-icon name="ban" />Revogar acesso</button>
                        }
                        <hr class="menu-sep" />
                        <button class="menu-item menu-item--danger" type="button" role="menuitem" (click)="deleteConnection(connection)">
                          <sid3-icon name="trash" />Excluir conexão
                        </button>
                      </sid3-menu>
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="5">
                    <sid3-empty-state icon="search" title="Nenhuma conexão encontrada" description="Tente outro termo de busca." [compact]="true">
                      <button class="btn btn--sm" type="button" (click)="query.set(''); onlyAttention.set(false)">Limpar filtros</button>
                    </sid3-empty-state>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>

    @if (isConnectDialogOpen()) {
      <sid3-modal
        title="Conectar Google Drive"
        subtitle="Você será levado ao Google para escolher a conta."
        icon="plug"
        [dismissable]="!isConnecting()"
        (closed)="closeConnectDialog()"
      >
        <form id="connect-form" class="field" (submit)="$event.preventDefault(); connectGoogle()">
          <label class="field__label" for="connect-name">Nome da conexão</label>
          <input
            id="connect-name"
            class="input"
            type="text"
            maxlength="100"
            autocomplete="off"
            data-autofocus
            [value]="connectName()"
            [placeholder]="defaultConnectionName"
            (input)="connectName.set($any($event.target).value)"
            aria-describedby="connect-name-hint"
          />
          <span class="field__hint" id="connect-name-hint">Um nome que identifique a conta, como "Drive pessoal". Em branco, fica {{ defaultConnectionName }}.</span>
        </form>
        <footer modal-footer class="modal__footer">
          <button class="btn" type="button" [disabled]="isConnecting()" (click)="closeConnectDialog()">Cancelar</button>
          <button class="btn btn--primary" type="submit" form="connect-form" [disabled]="isConnecting()">
            @if (isConnecting()) {
              <sid3-icon name="loader" [spin]="true" />Redirecionando...
            } @else {
              Continuar no Google<sid3-icon name="external" />
            }
          </button>
        </footer>
      </sid3-modal>
    }

    @if (sid3RootDialogConnection(); as connection) {
      <sid3-modal
        role="alertdialog"
        title='Pasta "sid3" já existe neste Drive'
        icon="folder"
        [dismissable]="!isResolvingSid3Root()"
        (closed)="closeSid3RootDialog()"
      >
        <p>
          Encontramos uma pasta <strong>sid3</strong> na raiz da conta
          <strong>{{ connection.providerAccountEmail ?? connection.displayName ?? 'conectada' }}</strong> que não foi criada pelo SID3.
          Você pode reutilizá-la para os envios desta conexão ou deixar o SID3 criar uma pasta nova e exclusiva.
        </p>
        @if (sid3RootDialogError()) {
          <div class="callout callout--danger" role="alert"><sid3-icon name="alert" /><span class="callout__text">{{ sid3RootDialogError() }}</span></div>
        }
        <footer modal-footer class="modal__footer">
          <button class="btn" type="button" [disabled]="isResolvingSid3Root()" (click)="closeSid3RootDialog()">Cancelar</button>
          <button class="btn" type="button" [disabled]="isResolvingSid3Root()" (click)="resolveSid3Root(connection, 'DECLINE')">Criar pasta nova</button>
          <button class="btn btn--primary" type="button" [disabled]="isResolvingSid3Root()" (click)="resolveSid3Root(connection, 'CONFIRM')">
            @if (isResolvingSid3Root()) {
              <sid3-icon name="loader" [spin]="true" />
            }
            Usar esta pasta
          </button>
        </footer>
      </sid3-modal>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConnectionsPageComponent {
  private readonly connectionsService = inject(ConnectionsService);
  private readonly notifications = inject(NotificationService);
  private readonly confirm = inject(ConfirmService);

  protected readonly initials = initials;
  protected readonly plural = plural;
  protected readonly statusLabel = connectionStatusLabel;
  protected readonly statusTone = connectionStatusTone;
  protected readonly sort = new TableSort<ConnectionSortKey>('name');
  protected readonly query = signal('');
  protected readonly onlyAttention = signal(false);
  protected readonly loadError = signal<{ message: string; details: string | null } | null>(null);

  protected readonly connections = signal<Connection[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly isConnecting = signal(false);
  protected readonly isConnectDialogOpen = signal(false);
  protected readonly connectName = signal(DEFAULT_CONNECTION_DISPLAY_NAME);
  protected readonly defaultConnectionName = DEFAULT_CONNECTION_DISPLAY_NAME;
  protected readonly reauthorizingId = signal<string | null>(null);
  protected readonly editingId = signal<string | null>(null);
  protected readonly editingName = signal('');
  protected readonly sid3RootDialogConnection = signal<Connection | null>(null);
  protected readonly isResolvingSid3Root = signal(false);
  protected readonly sid3RootDialogError = signal<string | null>(null);

  private readonly needsAttention = (connection: Connection): boolean =>
    connection.status !== 'CONNECTED' || connection.sid3RootFolderStatus === 'PENDING_CONFIRMATION';

  protected readonly attentionCount = computed(() => this.connections().filter(this.needsAttention).length);

  protected readonly visibleConnections = computed(() => {
    const query = this.query();
    const onlyAttention = this.onlyAttention();
    const rows = this.connections().filter(
      (connection) =>
        (!onlyAttention || this.needsAttention(connection)) &&
        matchesQuery(query, connection.displayName, connection.providerAccountEmail, this.projectNames(connection))
    );
    return this.sort.apply(rows, {
      name: (connection) => connection.displayName ?? connection.providerAccountEmail,
      status: (connection) => connectionStatusLabel(connection.status),
      createdAt: (connection) => connection.createdAt
    });
  });

  constructor() {
    this.loadConnections();
  }

  openConnectDialog(): void {
    this.connectName.set(DEFAULT_CONNECTION_DISPLAY_NAME);
    this.isConnectDialogOpen.set(true);
  }

  closeConnectDialog(): void {
    if (this.isConnecting()) {
      return;
    }
    this.isConnectDialogOpen.set(false);
  }

  connectGoogle(): void {
    const displayName = this.connectName().trim() || DEFAULT_CONNECTION_DISPLAY_NAME;
    this.isConnecting.set(true);
    this.connectionsService
      .createGoogleAuthorizationUrl({ displayName })
      .pipe(finalize(() => this.isConnecting.set(false)))
      .subscribe({
        next: (response) => {
          window.location.assign(response.authorizationUrl);
        },
        error: (error: unknown) => {
          this.isConnectDialogOpen.set(false);
          this.notifications.error(toApiErrorMessage(error));
        }
      });
  }

  startEdit(connection: Connection): void {
    this.editingId.set(connection.id);
    this.editingName.set(connection.displayName ?? '');
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.editingName.set('');
  }

  saveDisplayName(connection: Connection): void {
    const name = this.editingName().trim() || null;
    this.editingId.set(null);
    this.editingName.set('');

    if (name === connection.displayName) {
      return;
    }

    this.connectionsService.updateConnection(connection.id, { displayName: name }).subscribe({
      next: (updated) => {
        this.connections.update((items) => items.map((item) => (item.id === updated.id ? updated : item)));
        this.notifications.success('Nome da conexão atualizado.');
      },
      error: (error: unknown) => this.notifications.error(toApiErrorMessage(error))
    });
  }

  reauthorize(connection: Connection): void {
    this.reauthorizingId.set(connection.id);
    this.connectionsService
      .reauthorizeConnection(connection.id)
      .pipe(finalize(() => this.reauthorizingId.set(null)))
      .subscribe({
        next: (response) => {
          window.location.assign(response.authorizationUrl);
        },
        error: (error: unknown) => this.notifications.error(toApiErrorMessage(error))
      });
  }

  async revoke(connection: Connection): Promise<void> {
    const name = connection.displayName ?? connection.provider;
    const confirmed = await this.confirm.ask({
      title: `Revogar o acesso de "${name}"?`,
      message:
        'O acesso do SID3 é cancelado no Google. Os buckets e arquivos desta conta ficam inacessíveis até você reconectar.',
      confirmLabel: 'Revogar acesso'
    });
    if (!confirmed) {
      return;
    }
    this.connectionsService.revokeConnection(connection.id).subscribe({
      next: (updated) => {
        this.connections.update((items) => items.map((item) => (item.id === updated.id ? updated : item)));
        this.notifications.success(`Acesso de "${name}" revogado.`);
      },
      error: (error: unknown) => this.notifications.error(toApiErrorMessage(error))
    });
  }

  protected projectNames(connection: Connection): string {
    return connection.projects.map((project) => project.name).join(', ');
  }

  protected errorLabel(code: string): string {
    if (code === 'ACCOUNT_MISMATCH') return 'Tokens de outra conta Google: reconecte com a conta original.';
    if (code === 'AUTHORIZATION_FAILED') return 'O Google recusou a autorização: reconecte.';
    return code;
  }

  async deleteConnection(connection: Connection): Promise<void> {
    const name = connection.displayName ?? connection.provider;
    const confirmed = await this.confirm.ask({
      title: `Excluir a conexão "${name}"?`,
      message: 'Só é possível quando nenhum bucket, pool ou arquivo depende dela. Essa ação não pode ser desfeita.',
      confirmLabel: 'Excluir conexão'
    });
    if (!confirmed) {
      return;
    }
    this.connectionsService.deleteConnection(connection.id).subscribe({
      next: () => {
        this.connections.update((items) => items.filter((item) => item.id !== connection.id));
        this.notifications.success(`Conexão "${name}" excluída.`);
      },
      error: (error: unknown) => this.notifications.error(toApiErrorMessage(error))
    });
  }

  openSid3RootDialog(connection: Connection): void {
    this.sid3RootDialogError.set(null);
    this.sid3RootDialogConnection.set(connection);
  }

  closeSid3RootDialog(): void {
    if (this.isResolvingSid3Root()) {
      return;
    }
    this.sid3RootDialogConnection.set(null);
    this.sid3RootDialogError.set(null);
  }

  resolveSid3Root(connection: Connection, decision: Sid3RootFolderDecision): void {
    this.sid3RootDialogError.set(null);
    this.isResolvingSid3Root.set(true);
    this.connectionsService
      .confirmSid3RootFolder(connection.id, { decision })
      .pipe(finalize(() => this.isResolvingSid3Root.set(false)))
      .subscribe({
        next: (updated) => {
          this.connections.update((items) => items.map((item) => (item.id === updated.id ? updated : item)));
          this.sid3RootDialogConnection.set(null);
          this.notifications.success(decision === 'CONFIRM' ? 'Pasta sid3 confirmada.' : 'O SID3 vai criar uma pasta sid3 nova.');
        },
        error: (error: unknown) => this.sid3RootDialogError.set(toApiErrorMessage(error))
      });
  }

  loadConnections(): void {
    this.isLoading.set(true);
    this.loadError.set(null);
    this.connectionsService
      .listConnections()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (connections) => this.connections.set(connections),
        error: (error: unknown) => this.loadError.set({ message: toApiErrorMessage(error), details: toApiErrorDetails(error) })
      });
  }
}
