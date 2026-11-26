import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Estado vazio das telas de projeto quando o usuário ainda não criou nenhum projeto. */
@Component({
  selector: 'sid3-no-project-state',
  imports: [RouterLink],
  template: `
    <section class="panel empty-cta">
      <h2>Nenhum projeto selecionado</h2>
      <p class="muted">
        Projetos organizam buckets, chaves de API e quais contas do Google Drive cada um usa. Crie um projeto para
        começar.
      </p>
      <a class="button-link" routerLink="/projects">Criar projeto</a>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NoProjectStateComponent {}
