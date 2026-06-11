import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { toApiErrorMessage } from '../../core/api/api-error';
import { Connection } from './connection.models';
import { ConnectionsService } from './connections.service';

@Component({
  selector: 'sid3-connections-page',
  imports: [DatePipe],
  template: `
    <header class="topbar">
      <div>
        <p class="eyebrow">Provedores</p>
        <h1>Conexões</h1>
      </div>
      <button type="button" [disabled]="isConnecting()" (click)="connectGoogle()">
        {{ isConnecting() ? 'Conectando...' : 'Conectar Google Drive' }}
      </button>
    </header>

    @if (errorMessage()) {
      <p class="form-error">{{ errorMessage() }}</p>
    }

    <section class="panel">
      <header>
        <h2>Provedores conectados</h2>
        <p>Os tokens de acesso são criptografados pela API e nunca exibidos no dashboard.</p>
      </header>

      @if (isLoading()) {
        <p class="muted">Carregando conexões...</p>
      } @else if (connections().length === 0) {
        <p class="empty-state">Nenhum provedor conectado.</p>
      } @else {
        <div class="table connection-table" role="table" aria-label="Conexões de provedor">
          <div role="row" class="head">
            <span role="columnheader">Nome</span>
            <span role="columnheader">Provedor</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Conta</span>
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
              <span role="cell">{{ connection.provider }}</span>
              <span role="cell"><span class="badge">{{ connection.status }}</span></span>
              <span role="cell">{{ connection.providerAccountEmail ?? '—' }}</span>
              <span role="cell">{{ connection.createdAt | date: 'short' }}</span>
              <span role="cell">
                <button
                  class="secondary compact-button"
                  type="button"
                  [disabled]="connection.status === 'REVOKED'"
                  (click)="revoke(connection)"
                >
                  Revogar
                </button>
              </span>
            </div>
          }
        </div>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConnectionsPageComponent {
  private readonly connectionsService = inject(ConnectionsService);

  protected readonly connections = signal<Connection[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly isConnecting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly editingId = signal<string | null>(null);
  protected readonly editingName = signal('');

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

  revoke(connection: Connection): void {
    this.errorMessage.set(null);
    this.connectionsService.revokeConnection(connection.id).subscribe({
      next: (updated) => {
        this.connections.update((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      },
      error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
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
