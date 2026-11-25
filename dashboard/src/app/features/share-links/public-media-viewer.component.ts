import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  linkedSignal,
  output,
  signal,
  viewChild
} from '@angular/core';
import { formatBytes } from '../drive/drive-file.presenter';
import { PublicShareItem } from './share-link.models';

/**
 * Visualizador de imagem, vídeo e áudio de um link público. Navega entre as mídias da lista atual
 * (setas do teclado ou botões) e toca o vídeo em streaming direto da API, sem baixar o arquivo inteiro.
 */
@Component({
  selector: 'sid3-public-media-viewer',
  host: { '(document:keydown)': 'onKeydown($event)' },
  template: `
    <div class="modal-overlay media-viewer-overlay" role="presentation" (click)="closed.emit()">
      <div
        #panel
        class="preview-modal-panel media-viewer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="media-viewer-title"
        tabindex="-1"
        (click)="$event.stopPropagation()"
      >
        @if (current(); as item) {
          <header class="media-viewer-header">
            <div>
              <h3 id="media-viewer-title" [title]="item.name">{{ item.name }}</h3>
              <p class="field-hint">
                {{ bytes(item.sizeBytes) }}
                @if (items().length > 1) {
                  · {{ index() + 1 }} de {{ items().length }}
                }
              </p>
            </div>
            <button class="secondary compact-button" type="button" (click)="closed.emit()" aria-label="Fechar">✕</button>
          </header>

          <div class="preview-content media-viewer-content">
            @if (playbackFailed()) {
              <div class="empty-cta">
                <p>O navegador não conseguiu exibir este arquivo{{ item.previewKind === 'image' ? '' : ' (formato não suportado para reprodução)' }}.</p>
                <a class="button-link compact-button" [href]="downloadUrl()(item)" rel="nofollow">Baixar arquivo</a>
              </div>
            } @else {
              @switch (item.previewKind) {
                @case ('image') {
                  <img [src]="contentUrl()(item)" [alt]="item.name" (error)="playbackFailed.set(true)" />
                }
                @case ('video') {
                  <video [src]="contentUrl()(item)" controls autoplay playsinline preload="metadata" (error)="playbackFailed.set(true)">
                    Seu navegador não reproduz vídeos.
                  </video>
                }
                @case ('audio') {
                  <audio [src]="contentUrl()(item)" controls autoplay preload="metadata" (error)="playbackFailed.set(true)"></audio>
                }
              }
            }
          </div>

          <div class="modal-actions media-viewer-actions">
            <button class="secondary" type="button" [disabled]="index() <= 0" (click)="go(-1)">← Anterior</button>
            <a class="button-link" [href]="downloadUrl()(item)" rel="nofollow">Baixar</a>
            <button class="secondary" type="button" [disabled]="index() >= items().length - 1" (click)="go(1)">Próximo →</button>
          </div>
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PublicMediaViewerComponent {
  /** Mídias da lista atual, na ordem exibida. */
  readonly items = input.required<PublicShareItem[]>();
  readonly startId = input.required<string>();
  readonly contentUrl = input.required<(item: PublicShareItem) => string>();
  readonly downloadUrl = input.required<(item: PublicShareItem) => string>();
  readonly closed = output<void>();

  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');

  protected readonly index = linkedSignal(() =>
    Math.max(0, this.items().findIndex((item) => item.id === this.startId()))
  );
  protected readonly current = computed(() => this.items()[this.index()] ?? null);
  protected readonly playbackFailed = signal(false);

  constructor() {
    // Foco no diálogo para as setas e o Esc funcionarem logo ao abrir.
    afterNextRender(() => this.panel().nativeElement.focus());
  }

  protected bytes(value: number | null): string {
    return formatBytes(value);
  }

  protected go(step: number): void {
    const next = this.index() + step;
    if (next < 0 || next >= this.items().length) return;
    this.playbackFailed.set(false);
    this.index.set(next);
  }

  protected onKeydown(event: KeyboardEvent): void {
    // Não rouba as setas do player (avançar/voltar o vídeo pelo teclado).
    const fromMediaControls = event.target instanceof HTMLMediaElement;
    if (event.key === 'Escape') {
      this.closed.emit();
    } else if (event.key === 'ArrowRight' && !fromMediaControls) {
      this.go(1);
    } else if (event.key === 'ArrowLeft' && !fromMediaControls) {
      this.go(-1);
    }
  }
}
