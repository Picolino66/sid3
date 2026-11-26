import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProjectContextService } from '../../core/project-context/project-context.service';
import { EmptyStateComponent } from './empty-state.component';
import { ErrorStateComponent } from './error-state.component';

/**
 * Exibido nas telas de projeto quando não há projeto selecionado. Distingue "a lista de projetos não carregou"
 * (erro com Tentar novamente) de "o usuário ainda não criou projetos" (vazio com CTA).
 */
@Component({
  selector: 'sid3-no-project-state',
  imports: [RouterLink, EmptyStateComponent, ErrorStateComponent],
  template: `
    <section class="card">
      @if (projectContext.loadError(); as failure) {
        <sid3-error-state
          title="Não foi possível carregar seus projetos"
          [message]="failure.message"
          [details]="failure.details"
          [busy]="projectContext.isLoading()"
          (retry)="projectContext.retry()"
        />
      } @else {
        <sid3-empty-state
          icon="layers"
          title="Crie seu primeiro projeto"
          description="Projetos organizam buckets, chaves de API e quais contas do Google Drive cada um usa."
        >
          <a class="btn btn--primary" routerLink="/projects">Criar projeto</a>
        </sid3-empty-state>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NoProjectStateComponent {
  protected readonly projectContext = inject(ProjectContextService);
}
