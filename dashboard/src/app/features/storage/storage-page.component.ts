import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { catchError, combineLatest, filter, finalize, forkJoin, of, switchMap, tap } from 'rxjs';
import { toApiErrorDetails, toApiErrorMessage } from '../../core/api/api-error';
import { ErrorStateComponent } from '../../shared/ui/error-state.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { SkeletonComponent } from '../../shared/ui/skeleton.component';
import { ProjectContextService } from '../../core/project-context/project-context.service';
import { NoProjectStateComponent } from '../../shared/ui/no-project-state.component';
import { Bucket } from '../buckets/bucket.models';
import { BucketsService } from '../buckets/buckets.service';
import { Connection } from '../connections/connection.models';
import { ConnectionsService } from '../connections/connections.service';
import { ProjectConnection } from '../projects/project.models';
import { ProjectsService } from '../projects/projects.service';
import { StoragePool } from '../storage-pools/storage-pool.models';
import { StoragePoolsService } from '../storage-pools/storage-pools.service';
import { BucketsSectionComponent } from './buckets-section.component';
import { PoolsSectionComponent } from './pools-section.component';
import { ProjectConnectionsSectionComponent } from './project-connections-section.component';

/** Onde os arquivos do projeto ficam: contas do Drive do projeto, buckets e pools, numa tela só. */
@Component({
  selector: 'sid3-storage-page',
  imports: [NoProjectStateComponent, ProjectConnectionsSectionComponent, BucketsSectionComponent, PoolsSectionComponent, ErrorStateComponent, IconComponent, PageHeaderComponent, SkeletonComponent],
  template: `
    <sid3-page-header
      title="Armazenamento"
      description="Contas do Google Drive que este projeto usa, os buckets onde os arquivos ficam e, se precisar, pools que distribuem envios."
    />

    @if (projectContext.loaded() && !projectContext.currentProjectId()) {
      <sid3-no-project-state />
    } @else if (projectContext.currentProjectId(); as projectId) {
      @if (isLoading() && !loadedOnce()) {
        <div class="stack">
          <section class="card"><sid3-skeleton [count]="2" /></section>
          <section class="card"><sid3-skeleton [count]="3" /></section>
        </div>
      } @else if (errorMessage() && !loadedOnce()) {
        <section class="card">
          <sid3-error-state title="Não foi possível carregar o armazenamento" [message]="errorMessage()!" [details]="errorDetails()" [busy]="isLoading()" (retry)="reload()" />
        </section>
      } @else {
        @if (errorMessage()) {
          <div class="callout callout--danger" role="alert">
            <sid3-icon name="alert" /><span class="callout__text">Não foi possível atualizar. Estes são os últimos dados carregados.</span>
            <button class="btn btn--sm" type="button" (click)="reload()">Tentar novamente</button>
          </div>
        }
        <div class="stack" [style.opacity]="isLoading() ? 0.7 : 1">
          <sid3-project-connections-section
            [projectId]="projectId"
            [linked]="projectConnections()"
            [allConnections]="allConnections()"
            (changed)="reload()"
          />
          <sid3-buckets-section
            [projectId]="projectId"
            [buckets]="buckets()"
            [connections]="projectConnections()"
            [pools]="pools()"
            (changed)="reload()"
          />
          <sid3-pools-section [projectId]="projectId" [pools]="pools()" [connections]="projectConnections()" (changed)="reload()" />
        </div>
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StoragePageComponent {
  protected readonly projectContext = inject(ProjectContextService);
  private readonly projectsService = inject(ProjectsService);
  private readonly connectionsService = inject(ConnectionsService);
  private readonly bucketsService = inject(BucketsService);
  private readonly storagePoolsService = inject(StoragePoolsService);

  protected readonly projectConnections = signal<ProjectConnection[]>([]);
  protected readonly allConnections = signal<Connection[]>([]);
  protected readonly buckets = signal<Bucket[]>([]);
  protected readonly pools = signal<StoragePool[]>([]);
  protected readonly isLoading = signal(false);
  protected readonly loadedOnce = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly errorDetails = signal<string | null>(null);
  private readonly reloadTick = signal(0);

  constructor() {
    combineLatest([toObservable(this.projectContext.currentProjectId), toObservable(this.reloadTick)])
      .pipe(
        filter(([projectId]) => Boolean(projectId)),
        switchMap(([projectId]) => this.load(projectId!)),
        takeUntilDestroyed()
      )
      .subscribe();
  }

  reload(): void {
    this.reloadTick.update((tick) => tick + 1);
  }

  private load(projectId: string) {
    this.isLoading.set(true);
    return forkJoin({
      projectConnections: this.projectsService.listProjectConnections(projectId),
      allConnections: this.connectionsService.listConnections(),
      buckets: this.bucketsService.listBuckets(projectId),
      pools: this.storagePoolsService.listPools(projectId)
    }).pipe(
      tap((result) => {
        this.projectConnections.set(result.projectConnections);
        this.allConnections.set(result.allConnections);
        this.buckets.set(result.buckets);
        this.pools.set(result.pools);
        this.errorMessage.set(null);
        this.loadedOnce.set(true);
      }),
      catchError((error: unknown) => {
        this.errorMessage.set(toApiErrorMessage(error));
        this.errorDetails.set(toApiErrorDetails(error));
        return of(null);
      }),
      finalize(() => this.isLoading.set(false))
    );
  }
}
