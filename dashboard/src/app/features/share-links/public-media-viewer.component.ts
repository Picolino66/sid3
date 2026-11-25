import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild
} from '@angular/core';
import { formatBytes } from '../drive/drive-file.presenter';
import { PublicShareItem } from './share-link.models';
import { TransportStreamPlayer } from './transport-stream-playback';

/**
 * Visualizador de imagem, vídeo e áudio de um link público. Navega entre as mídias da lista atual
 * (setas do teclado ou botões) e toca o vídeo em streaming direto da API, sem baixar o arquivo inteiro.
 * Se o navegador recusar o vídeo, toca-o como MPEG-TS (convertido no navegador), com controles próprios.
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

          <div #stage class="preview-content media-viewer-content">
            @if (playbackFailed()) {
              <div class="empty-cta">
                <p>O navegador não conseguiu exibir este arquivo{{ item.previewKind === 'image' ? '' : ' (formato não suportado para reprodução)' }}.</p>
                <a class="button-link compact-button" [href]="downloadUrl()(item)" rel="nofollow">Baixar arquivo</a>
              </div>
            } @else {
              @if (isConverting()) {
                <p class="media-viewer-note" role="status">Formato MPEG-TS: convertendo no navegador para reproduzir…</p>
              }
              <!-- Um elemento novo por item: o player de MPEG-TS assume o <video> e não pode ser reaproveitado. -->
              @for (media of [item]; track media.id) {
                @switch (media.previewKind) {
                  @case ('image') {
                    <img [src]="contentUrl()(media)" [alt]="media.name" (error)="playbackFailed.set(true)" />
                  }
                  @case ('video') {
                    <video
                      [src]="contentUrl()(media)"
                      [controls]="!tsMode()"
                      autoplay
                      playsinline
                      preload="metadata"
                      (error)="onVideoError($event, media)"
                      (playing)="isConverting.set(false)"
                      (timeupdate)="syncTsPosition()"
                      (play)="tsPaused.set(false)"
                      (pause)="tsPaused.set(true)"
                      (volumechange)="tsMuted.set($any($event.target).muted)"
                      (click)="tsMode() && togglePlay($event)"
                    >
                      Seu navegador não reproduz vídeos.
                    </video>
                  }
                  @case ('audio') {
                    <audio [src]="contentUrl()(media)" controls autoplay preload="metadata" (error)="playbackFailed.set(true)"></audio>
                  }
                }
              }

              @if (tsMode()) {
                <div class="ts-controls">
                  <button type="button" class="ts-control-button" (click)="togglePlay()" [attr.aria-label]="tsPaused() ? 'Reproduzir' : 'Pausar'">
                    {{ tsPaused() ? '▶' : '⏸' }}
                  </button>
                  <span class="ts-time">{{ clock(tsPosition()) }}@if (tsDuration(); as total) { / {{ clock(total) }} }</span>
                  @if (tsDuration(); as total) {
                    <input
                      class="ts-seek"
                      type="range"
                      min="0"
                      [max]="total"
                      step="1"
                      [value]="tsPosition()"
                      aria-label="Posição do vídeo"
                      (input)="tsScrubbing.set(true); tsPosition.set(+$any($event.target).value)"
                      (change)="seekTo(+$any($event.target).value)"
                    />
                  } @else {
                    <span class="ts-time muted">sem duração: não é possível avançar</span>
                  }
                  <button type="button" class="ts-control-button" (click)="toggleMute()" [attr.aria-label]="tsMuted() ? 'Ativar som' : 'Silenciar'">
                    {{ tsMuted() ? '🔇' : '🔊' }}
                  </button>
                  <button type="button" class="ts-control-button" (click)="toggleFullscreen()" aria-label="Tela cheia">⛶</button>
                </div>
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
  /** Duração do vídeo (do Google Drive), necessária para avançar vídeos MPEG-TS. */
  readonly loadDurationMs = input.required<(item: PublicShareItem) => Promise<number | null>>();
  readonly closed = output<void>();

  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly stage = viewChild<ElementRef<HTMLElement>>('stage');

  protected readonly index = linkedSignal(() =>
    Math.max(0, this.items().findIndex((item) => item.id === this.startId()))
  );
  protected readonly current = computed(() => this.items()[this.index()] ?? null);
  protected readonly playbackFailed = signal(false);
  protected readonly isConverting = signal(false);

  // Estado dos controles próprios do modo MPEG-TS.
  protected readonly tsMode = signal(false);
  protected readonly tsPosition = signal(0);
  protected readonly tsDuration = signal<number | null>(null);
  protected readonly tsPaused = signal(false);
  protected readonly tsMuted = signal(false);
  protected readonly tsScrubbing = signal(false);

  /** Item para o qual o modo MPEG-TS já foi tentado (evita repetir a tentativa em loop). */
  private tsItemId: string | null = null;
  private tsPlayer: TransportStreamPlayer | null = null;
  private tsVideo: HTMLVideoElement | null = null;

  constructor() {
    // Foco no diálogo para as setas e o Esc funcionarem logo ao abrir.
    afterNextRender(() => this.panel().nativeElement.focus());
    inject(DestroyRef).onDestroy(() => this.resetTransportStream());
  }

  protected bytes(value: number | null): string {
    return formatBytes(value);
  }

  protected clock(totalSeconds: number): string {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = String(seconds % 60).padStart(2, '0');
    return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
  }

  /** Primeira falha: tenta como MPEG-TS. Falha de novo (ou sem suporte): oferece o download. */
  protected async onVideoError(event: Event, item: PublicShareItem): Promise<void> {
    if (this.tsItemId === item.id) {
      this.failPlayback();
      return;
    }

    const video = event.target as HTMLVideoElement;
    this.tsItemId = item.id;
    this.isConverting.set(true);
    try {
      const durationMs = await this.loadDurationMs()(item).catch(() => null);
      if (this.tsItemId !== item.id) return; // o usuário já foi para outro item

      const player = await TransportStreamPlayer.create({
        video,
        url: this.contentUrl()(item),
        sizeBytes: item.sizeBytes,
        durationMs,
        onFailure: () => this.failPlayback()
      });
      if (this.tsItemId !== item.id) {
        player?.destroy();
        return;
      }
      if (!player) {
        this.failPlayback();
        return;
      }
      this.tsPlayer = player;
      this.tsVideo = video;
      this.tsDuration.set(player.canSeek ? player.durationSeconds : null);
      this.tsPosition.set(0);
      this.tsMuted.set(video.muted);
      this.tsMode.set(true);
    } catch {
      this.failPlayback();
    }
  }

  protected syncTsPosition(): void {
    if (this.tsPlayer && !this.tsScrubbing()) {
      this.tsPosition.set(this.tsPlayer.position);
    }
  }

  protected seekTo(seconds: number): void {
    this.tsScrubbing.set(false);
    this.tsPlayer?.seek(seconds);
    this.tsPosition.set(seconds);
  }

  protected togglePlay(event?: Event): void {
    event?.stopPropagation();
    const video = this.tsVideo;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }

  protected toggleMute(): void {
    if (this.tsVideo) {
      this.tsVideo.muted = !this.tsVideo.muted;
    }
  }

  protected toggleFullscreen(): void {
    const stage = this.stage()?.nativeElement;
    if (!stage) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void stage.requestFullscreen().catch(() => undefined);
    }
  }

  protected go(step: number): void {
    const next = this.index() + step;
    if (next < 0 || next >= this.items().length) return;
    this.resetTransportStream();
    this.playbackFailed.set(false);
    this.index.set(next);
  }

  protected onKeydown(event: KeyboardEvent): void {
    // Não rouba as setas de quem está usando um controle do player (vídeo ou barra de tempo).
    const target = event.target;
    const fromPlayerControls = target instanceof HTMLMediaElement || target instanceof HTMLInputElement;
    if (event.key === 'Escape') {
      this.closed.emit();
    } else if (event.key === 'ArrowRight' && !fromPlayerControls) {
      this.go(1);
    } else if (event.key === 'ArrowLeft' && !fromPlayerControls) {
      this.go(-1);
    }
  }

  private failPlayback(): void {
    this.tsPlayer?.destroy();
    this.tsPlayer = null;
    this.tsVideo = null;
    this.tsMode.set(false);
    this.isConverting.set(false);
    this.playbackFailed.set(true);
  }

  /** Para o player de MPEG-TS e esquece a tentativa, para tentar de novo ao voltar ao item. */
  private resetTransportStream(): void {
    this.tsPlayer?.destroy();
    this.tsPlayer = null;
    this.tsVideo = null;
    this.tsItemId = null;
    this.tsMode.set(false);
    this.tsDuration.set(null);
    this.tsPosition.set(0);
    this.tsScrubbing.set(false);
    this.isConverting.set(false);
  }
}
