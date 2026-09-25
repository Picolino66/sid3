import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { toApiErrorMessage } from '../../core/api/api-error';
import { Connection, Sid3RootFolderDecision } from './connection.models';
import { ConnectionsService } from './connections.service';

@Component({
  selector: 'sid3-connections-page',
  imports: [DatePipe],
  template: `
    <header class="topbar">
      <div>
        <h1>Conexões</h1>
      </div>
    </header>

    @if (errorMessage()) {
      <p class="form-error">{{ errorMessage() }}</p>
    }

    <section class="panel">
      <header class="panel-header-row">
        <h2>Contas Google Drive conectadas</h2>
        <button type="button" [disabled]="isConnecting()" (click)="connectGoogle()">
          {{ isConnecting() ? 'Conectando...' : 'Conectar Google Drive' }}
        </button>
      </header>

      @if (isLoading()) {
        <p class="muted">Carregando conexões...</p>
      } @else if (connections().length === 0) {
        <div class="empty-cta">
          <p class="muted">Nenhuma conta conectada ainda.</p>
          <button type="button" [disabled]="isConnecting()" (click)="connectGoogle()">
            {{ isConnecting() ? 'Conectando...' : 'Conectar Google Drive' }}
          </button>
        </div>
      } @else {
        <div class="table connection-table" role="table" aria-label="Conexões de provedor">
          <div role="row" class="head">
            <span role="columnheader">Nome</span>
            <span role="columnheader">Conta</span>
            <span role="columnheader">Provedor</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Criado em</span>
            <span role="columnheader">Ação</span>
          </div>
          @for (connection of connections(); track connection.id) {
            <div role="row">
              <span role="cell">
                @if (editingId() === connection.id) {
                  <input
                    type="text"
                    [value]="editingName()"
                    (input)="editingName.set($any($event.target).value)"
                    (blur)="saveDisplayName(connection)"
                    (keydown.enter)="saveDisplayName(connection)"
                    (keydown.escape)="cancelEdit()"
                    class="inline-edit"
                  />
                } @else {
                  <span (dblclick)="startEdit(connection)" title="Duplo clique para renomear">
                    {{ connection.displayName ?? connection.provider }}
                  </span>
                }
              </span>
              <span role="cell">{{ connection.providerAccountEmail ?? '—' }}</span>
              <span role="cell">{{ connection.provider === 'GOOGLE_DRIVE' ? 'Google Drive' : connection.provider }}</span>
              <span role="cell">
                <span [class]="'status-label ' + connection.status.toLowerCase()">
                  {{ connection.status === 'CONNECTED' ? 'Conectado' : connection.status === 'REVOKED' ? 'Revogado' : 'Erro' }}
                </span>
                @if (connection.sid3RootFolderStatus === 'PENDING_CONFIRMATION') {
                  <span class="status-label pending_confirmation">Pasta sid3 pendente</span>
                }
              </span>
              <span role="cell">{{ connection.createdAt | date: 'dd/MM/yyyy HH:mm' }}</span>
              <span role="cell" class="action-cell">
                @if (connection.sid3RootFolderStatus === 'PENDING_CONFIRMATION') {
                  <button
                    class="compact-button"
                    type="button"
                    (click)="openSid3RootDialog(connection)"
                  >
                    Resolver pasta sid3
                  </button>
                }
                <button
                  class="compact-button"
                  type="button"
                  [disabled]="reauthorizingId() === connection.id"
                  (click)="reauthorize(connection)"
                >
                  {{ reauthorizingId() === connection.id ? 'Redirecionando...' : 'Reconectar' }}
                </button>
                @if (connection.status === 'CONNECTED') {
                  <button
                    class="danger compact-button"
                    type="button"
                    (click)="revoke(connection)"
                  >
                    Revogar
                  </button>
                }
              </span>
            </div>
          }
        </div>
      }
    </section>

    @if (sid3RootDialogConnection(); as connection) {
      <div class="modal-overlay" role="presentation" (click)="closeSid3RootDialog()">
        <div
          class="modal-panel"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="sid3-root-dialog-title"
          (click)="$event.stopPropagation()"
        >
          <h3 id="sid3-root-dialog-title">Pasta "sid3" já existe neste Google Drive</h3>
          <p>
            Encontramos uma pasta chamada <strong>sid3</strong> na raiz da conta
            <strong>{{ connection.providerAccountEmail ?? connection.displayName ?? 'conectada' }}</strong>,
            que não foi criada pelo SID3. Você pode reutilizar essa pasta para os uploads desta conexão ou
            recusar e deixar o SID3 criar uma pasta "sid3" nova e exclusiva.
          </p>
          @if (sid3RootDialogError()) {
            <p class="form-error">{{ sid3RootDialogError() }}</p>
          }
          <div class="modal-actions">
            <button
              class="secondary compact-button"
              type="button"
              [disabled]="isResolvingSid3Root()"
              (click)="closeSid3RootDialog()"
            >
              Cancelar
            </button>
            <button
              class="danger compact-button"
              type="button"
              [disabled]="isResolvingSid3Root()"
              (click)="resolveSid3Root(connection, 'DECLINE')"
            >
              {{ isResolvingSid3Root() ? 'Processando...' : 'Recusar e criar nova' }}
            </button>
            <button
              class="compact-button"
              type="button"
              [disabled]="isResolvingSid3Root()"
              (click)="resolveSid3Root(connection, 'CONFIRM')"
            >
              {{ isResolvingSid3Root() ? 'Processando...' : 'Confirmar uso desta pasta' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConnectionsPageComponent {
  private readonly connectionsService = inject(ConnectionsService);

  protected readonly connections = signal<Connection[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly isConnecting = signal(false);
  protected readonly reauthorizingId = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly editingId = signal<string | null>(null);
  protected readonly editingName = signal('');
  protected readonly sid3RootDialogConnection = signal<Connection | null>(null);
  protected readonly isResolvingSid3Root = signal(false);
  protected readonly sid3RootDialogError = signal<string | null>(null);

  constructor() {
    this.loadConnections();
  }

  connectGoogle(): void {
    this.errorMessage.set(null);
    this.isConnecting.set(true);
    this.connectionsService
      .createGoogleAuthorizationUrl()
      .pipe(finalize(() => this.isConnecting.set(false)))
      .subscribe({
        next: (response) => {
          window.location.assign(response.authorizationUrl);
        },
        error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
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
      },
      error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
    });
  }

  reauthorize(connection: Connection): void {
    this.errorMessage.set(null);
    this.reauthorizingId.set(connection.id);
    this.connectionsService
      .reauthorizeConnection(connection.id)
      .pipe(finalize(() => this.reauthorizingId.set(null)))
      .subscribe({
        next: (response) => {
          window.location.assign(response.authorizationUrl);
        },
        error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
      });
  }

  revoke(connection: Connection): void {
    const name = connection.displayName ?? connection.provider;
    if (!window.confirm(`Revogar a conexão com ${name}? Buckets que dependem desta conta deixarão de funcionar.`)) {
      return;
    }
    this.errorMessage.set(null);
    this.connectionsService.revokeConnection(connection.id).subscribe({
      next: (updated) => {
        this.connections.update((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      },
      error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
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
        },
        error: (error: unknown) => this.sid3RootDialogError.set(toApiErrorMessage(error))
      });
  }

  private loadConnections(): void {
    this.isLoading.set(true);
    this.connectionsService
      .listConnections()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (connections) => this.connections.set(connections),
        error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
      });
  }
}
