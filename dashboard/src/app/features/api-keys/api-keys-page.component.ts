import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { toApiErrorDetails, toApiErrorMessage } from '../../core/api/api-error';
import { NotificationService } from '../../core/notifications/notification.service';
import { ProjectContextService } from '../../core/project-context/project-context.service';
import { ConfirmService } from '../../shared/ui/confirm.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { ErrorStateComponent } from '../../shared/ui/error-state.component';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { plural } from '../../shared/ui/format';
import { IconComponent } from '../../shared/ui/icon.component';
import { MenuComponent } from '../../shared/ui/menu.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { NoProjectStateComponent } from '../../shared/ui/no-project-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { SkeletonComponent } from '../../shared/ui/skeleton.component';
import { matchesQuery, TableSort } from '../../shared/ui/table-sort';
import { ApiKey } from './api-key.models';
import { ApiKeysService } from './api-keys.service';

type ApiKeySortKey = 'name' | 'lastUsedAt' | 'createdAt';

@Component({
  selector: 'sid3-api-keys-page',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    EmptyStateComponent,
    ErrorStateComponent,
    FieldErrorComponent,
    IconComponent,
    MenuComponent,
    ModalComponent,
    NoProjectStateComponent,
    PageHeaderComponent,
    SkeletonComponent
  ],
  template: `
    <sid3-page-header title="Chaves de API" description="Chaves permitem que outros sistemas enviem e leiam arquivos deste projeto sem login.">
      @if (selectedProjectId()) {
        <button class="btn btn--primary" type="button" (click)="openCreate()"><sid3-icon name="plus" />Nova chave</button>
      }
    </sid3-page-header>

    @if (projectContext.loaded() && !selectedProjectId()) {
      <sid3-no-project-state />
    } @else {
      <section class="card">
        @if (isLoading() && apiKeys().length === 0) {
          <sid3-skeleton [count]="3" label="Carregando chaves de API" />
        } @else if (loadError(); as failure) {
          <sid3-error-state
            title="Não foi possível carregar as chaves"
            [message]="failure.message"
            [details]="failure.details"
            [busy]="isLoading()"
            (retry)="reload()"
          />
        } @else if (apiKeys().length === 0) {
          <sid3-empty-state
            icon="key"
            title="Nenhuma chave de API"
            description="Crie uma chave para enviar arquivos a este projeto a partir de servidores, scripts ou apps."
          >
            <button class="btn btn--primary" type="button" (click)="openCreate()"><sid3-icon name="plus" />Criar chave</button>
          </sid3-empty-state>
        } @else {
          <div class="toolbar">
            <div class="toolbar__group">
              <label class="input-icon toolbar__search">
                <span class="sr-only">Buscar chave</span>
                <sid3-icon name="search" />
                <input class="input input--sm" type="search" placeholder="Buscar por nome ou prefixo" [value]="query()" (input)="query.set($any($event.target).value)" />
              </label>
              <div class="segmented" role="group" aria-label="Filtrar por status">
                <button type="button" [attr.aria-pressed]="statusFilter() === 'active'" (click)="statusFilter.set('active')">Ativas ({{ activeCount() }})</button>
                <button type="button" [attr.aria-pressed]="statusFilter() === 'all'" (click)="statusFilter.set('all')">Todas ({{ apiKeys().length }})</button>
              </div>
            </div>
          </div>
          <div class="table-wrap">
            <table class="table table--responsive">
              <thead>
                <tr>
                  <th [attr.aria-sort]="sort.aria('name')">
                    <button class="sort-btn" type="button" (click)="sort.toggle('name')">Nome <sid3-icon [name]="sort.icon('name')" size="sm" /></button>
                  </th>
                  <th>Prefixo</th>
                  <th [attr.aria-sort]="sort.aria('lastUsedAt')">
                    <button class="sort-btn" type="button" (click)="sort.toggle('lastUsedAt')">Último uso <sid3-icon [name]="sort.icon('lastUsedAt')" size="sm" /></button>
                  </th>
                  <th>Status</th>
                  <th class="col-actions"><span class="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                @for (apiKey of visibleKeys(); track apiKey.id) {
                  <tr>
                    <td class="cell-primary">
                      <div class="cell-main">
                        <strong>{{ apiKey.name }}</strong>
                        <span>Criada em {{ apiKey.createdAt | date: 'dd/MM/yyyy' }}</span>
                      </div>
                    </td>
                    <td data-label="Prefixo"><code class="code-inline">{{ apiKey.prefix }}</code></td>
                    <td class="col-date" data-label="Último uso">{{ apiKey.lastUsedAt ? (apiKey.lastUsedAt | date: 'dd/MM/yyyy HH:mm') : 'Nunca usada' }}</td>
                    <td data-label="Status">
                      <span [class]="apiKey.revokedAt ? 'chip chip--neutral' : 'chip chip--success'">{{ apiKey.revokedAt ? 'Revogada' : 'Ativa' }}</span>
                    </td>
                    <td class="col-actions col-actions--corner">
                      <sid3-menu [label]="'Ações da chave ' + apiKey.name">
                        <button class="menu-item" type="button" role="menuitem" (click)="renew(apiKey)"><sid3-icon name="rotate" />Gerar novo segredo</button>
                        <hr class="menu-sep" />
                        <button class="menu-item menu-item--danger" type="button" role="menuitem" [disabled]="!!apiKey.revokedAt" (click)="revoke(apiKey)">
                          <sid3-icon name="ban" />Revogar chave
                        </button>
                      </sid3-menu>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="5">
                      <sid3-empty-state icon="search" title="Nenhuma chave encontrada" [compact]="true">
                        <button class="btn btn--sm" type="button" (click)="query.set(''); statusFilter.set('all')">Limpar filtros</button>
                      </sid3-empty-state>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="table-footer">{{ plural(visibleKeys().length, 'chave', 'chaves') }}</div>
        }
      </section>
    }

    @if (dialog(); as mode) {
      <sid3-modal
        [title]="createdSecret() ? 'Copie o segredo agora' : 'Nova chave de API'"
        [subtitle]="createdSecret() ? null : 'Projeto: ' + (selectedProject()?.name ?? '')"
        [icon]="createdSecret() ? 'key' : null"
        [dismissable]="!isSubmitting() && !createdSecret()"
        (closed)="closeDialog()"
      >
        @if (createdSecret(); as secret) {
          <div class="callout callout--warn"><sid3-icon name="alert" /><span class="callout__text">Este segredo não será exibido de novo. Guarde-o num cofre ou variável de ambiente.</span></div>
          <div class="field">
            <span class="field__label">Segredo {{ mode === 'renew' ? 'novo' : '' }}</span>
            <div class="input-group">
              <input class="input mono" readonly [value]="secret" aria-label="Segredo da chave" (focus)="$any($event.target).select()" />
              <button class="btn" type="button" data-autofocus (click)="copySecret()">
                <sid3-icon [name]="copied() ? 'check' : 'copy'" />{{ copied() ? 'Copiado' : 'Copiar' }}
              </button>
            </div>
            <span class="field__hint">Use no cabeçalho <code class="code-inline">X-SID3-API-Key</code>.</span>
          </div>
        } @else {
          <form id="api-key-form" class="field" [formGroup]="form" (ngSubmit)="createApiKey()">
            <label class="field__label" for="api-key-name">Nome<span class="field__req" aria-hidden="true">*</span></label>
            <input id="api-key-name" class="input" type="text" formControlName="name" placeholder="Ex.: Integração de produção" data-autofocus aria-describedby="api-key-name-error api-key-name-hint" />
            <sid3-field-error id="api-key-name-error" [control]="form.controls.name" [messages]="{ required: 'Dê um nome para identificar a chave.', minlength: 'Use pelo menos 2 caracteres.' }" />
            <span class="field__hint" id="api-key-name-hint">Identifica onde a chave é usada.</span>
          </form>
        }
        <footer modal-footer class="modal__footer">
          @if (createdSecret()) {
            <button class="btn btn--primary" type="button" (click)="closeDialog()">Concluir</button>
          } @else {
            <button class="btn" type="button" [disabled]="isSubmitting()" (click)="closeDialog()">Cancelar</button>
            <button class="btn btn--primary" type="submit" form="api-key-form" [disabled]="isSubmitting()">
              @if (isSubmitting()) {
                <sid3-icon name="loader" [spin]="true" />Criando...
              } @else {
                Criar chave
              }
            </button>
          }
        </footer>
      </sid3-modal>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ApiKeysPageComponent {
  protected readonly projectContext = inject(ProjectContextService);
  private readonly apiKeysService = inject(ApiKeysService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly notifications = inject(NotificationService);
  private readonly confirm = inject(ConfirmService);

  protected readonly projects = this.projectContext.projects;
  protected readonly apiKeys = signal<ApiKey[]>([]);
  protected readonly selectedProjectId = computed(() => this.projectContext.currentProjectId() ?? '');
  protected readonly selectedProject = computed(() => this.projects().find((project) => project.id === this.selectedProjectId()));
  protected readonly createdSecret = signal<string | null>(null);
  protected readonly copied = signal(false);
  protected readonly isLoading = signal(true);
  protected readonly isSubmitting = signal(false);
  protected readonly loadError = signal<{ message: string; details: string | null } | null>(null);
  protected readonly dialog = signal<'create' | 'renew' | null>(null);
  protected readonly query = signal('');
  protected readonly statusFilter = signal<'active' | 'all'>('active');
  protected readonly sort = new TableSort<ApiKeySortKey>('name');
  protected readonly plural = plural;
  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]]
  });

  protected readonly activeCount = computed(() => this.apiKeys().filter((apiKey) => !apiKey.revokedAt).length);

  protected readonly visibleKeys = computed(() => {
    const query = this.query();
    const onlyActive = this.statusFilter() === 'active';
    const rows = this.apiKeys().filter((apiKey) => (!onlyActive || !apiKey.revokedAt) && matchesQuery(query, apiKey.name, apiKey.prefix));
    return this.sort.apply(rows, {
      name: (apiKey) => apiKey.name,
      lastUsedAt: (apiKey) => apiKey.lastUsedAt,
      createdAt: (apiKey) => apiKey.createdAt
    });
  });

  constructor() {
    toObservable(this.projectContext.currentProjectId)
      .pipe(takeUntilDestroyed())
      .subscribe((projectId) => {
        if (projectId) {
          this.loadApiKeys(projectId);
        } else {
          this.isLoading.set(false);
        }
      });
  }

  openCreate(): void {
    this.form.reset();
    this.createdSecret.set(null);
    this.copied.set(false);
    this.dialog.set('create');
  }

  closeDialog(): void {
    if (this.isSubmitting()) return;
    this.dialog.set(null);
    this.createdSecret.set(null);
  }

  reload(): void {
    const projectId = this.selectedProjectId();
    if (projectId) this.loadApiKeys(projectId);
  }

  copySecret(): void {
    const secret = this.createdSecret();
    if (!secret) return;
    void navigator.clipboard.writeText(secret).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }

  createApiKey(): void {
    const projectId = this.selectedProjectId();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (!projectId || this.isSubmitting()) {
      return;
    }

    this.createdSecret.set(null);
    this.copied.set(false);
    this.isSubmitting.set(true);
    this.apiKeysService
      .createApiKey(projectId, this.form.getRawValue())
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: (created) => {
          this.apiKeys.update((apiKeys) => [...apiKeys, created.apiKey]);
          this.createdSecret.set(created.secret);
          this.form.reset();
          this.notifications.success(`Chave "${created.apiKey.name}" criada.`);
        },
        error: (error: unknown) => this.notifications.error(toApiErrorMessage(error))
      });
  }

  async renew(apiKey: ApiKey): Promise<void> {
    const projectId = this.selectedProjectId();
    if (!projectId) return;

    const confirmed = await this.confirm.ask({
      title: `Gerar novo segredo para "${apiKey.name}"?`,
      message: 'O segredo atual deixa de funcionar na hora. Você verá o novo uma única vez.',
      confirmLabel: 'Gerar novo segredo'
    });
    if (!confirmed) {
      return;
    }

    this.createdSecret.set(null);
    this.copied.set(false);

    this.apiKeysService.regenerateApiKey(projectId, apiKey.id).subscribe({
      next: (created) => {
        this.apiKeys.update((keys) => keys.map((k) => (k.id === apiKey.id ? created.apiKey : k)));
        this.createdSecret.set(created.secret);
        this.dialog.set('renew');
      },
      error: (error: unknown) => this.notifications.error(toApiErrorMessage(error))
    });
  }

  async revoke(apiKey: ApiKey): Promise<void> {
    const projectId = this.selectedProjectId();
    if (!projectId) {
      return;
    }

    const confirmed = await this.confirm.ask({
      title: `Revogar a chave "${apiKey.name}"?`,
      message: 'Aplicações que usam este segredo deixam de funcionar na hora. Essa ação não pode ser desfeita.',
      confirmLabel: 'Revogar chave'
    });
    if (!confirmed) {
      return;
    }

    this.apiKeysService.revokeApiKey(projectId, apiKey.id).subscribe({
      next: () => {
        this.apiKeys.update((apiKeys) =>
          apiKeys.map((item) => (item.id === apiKey.id ? { ...item, revokedAt: new Date().toISOString() } : item))
        );
        this.notifications.success(`Chave "${apiKey.name}" revogada.`);
      },
      error: (error: unknown) => this.notifications.error(toApiErrorMessage(error))
    });
  }

  private loadApiKeys(projectId: string): void {
    this.isLoading.set(true);
    this.loadError.set(null);
    this.apiKeysService
      .listApiKeys(projectId)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (apiKeys) => this.apiKeys.set(apiKeys),
        error: (error: unknown) => this.loadError.set({ message: toApiErrorMessage(error), details: toApiErrorDetails(error) })
      });
  }
}
