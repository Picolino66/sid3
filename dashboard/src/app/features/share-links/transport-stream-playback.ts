import type MpegtsModule from 'mpegts.js';

type Mpegts = typeof MpegtsModule;
type MpegtsPlayer = ReturnType<Mpegts['createPlayer']>;

/** Pacotes MPEG-TS têm 188 bytes; recomeçar a leitura em múltiplos disso cai no início de um pacote. */
const TS_PACKET_SIZE = 188;

let mpegtsModule: Promise<Mpegts> | null = null;

/**
 * Byte onde recomeçar a leitura para chegar perto de `targetSeconds`, supondo taxa de bits constante,
 * alinhado ao início de um pacote. `baseTime` é o tempo estimado desse byte (a posição exibida parte dele).
 */
export function transportStreamStartPoint(
  targetSeconds: number,
  durationSeconds: number,
  sizeBytes: number
): { offset: number; baseTime: number } {
  if (targetSeconds <= 0 || durationSeconds <= 0 || sizeBytes <= 0) {
    return { offset: 0, baseTime: 0 };
  }
  const ratio = Math.min(targetSeconds / durationSeconds, 1);
  const lastPacketStart = Math.max(0, Math.floor((sizeBytes - 1) / TS_PACKET_SIZE) * TS_PACKET_SIZE);
  const offset = Math.min(Math.floor((ratio * sizeBytes) / TS_PACKET_SIZE) * TS_PACKET_SIZE, lastPacketStart);
  return { offset, baseTime: (offset / sizeBytes) * durationSeconds };
}

/** A biblioteca só é baixada quando alguém abre um vídeo nesse formato. */
function loadMpegts(): Promise<Mpegts> {
  mpegtsModule ??= import('mpegts.js').then(({ default: mpegts }) => {
    mpegts.LoggingControl.applyConfig({ enableDebug: false, enableVerbose: false, enableInfo: false });
    return mpegts;
  });
  return mpegtsModule;
}

/**
 * Reprodução de vídeos MPEG-TS (comum em aulas baixadas de streaming e salvas como ".mp4"), que o navegador
 * não toca sozinho. O mpegts.js converte o fluxo para MP4 no próprio navegador (Media Source Extensions).
 *
 * MPEG-TS não tem índice, então o mpegts.js não avança para trechos ainda não carregados. Para avançar,
 * este player estima o byte correspondente ao tempo pedido (duração do Google Drive × tamanho do arquivo)
 * e recomeça a conversão dali, usando `?start=` da API. A posição exibida é o início estimado + o tempo tocado.
 */
export class TransportStreamPlayer {
  private player: MpegtsPlayer | null = null;
  private baseTime = 0;
  private destroyed = false;

  private constructor(
    private readonly mpegts: Mpegts,
    private readonly video: HTMLVideoElement,
    private readonly url: string,
    private readonly sizeBytes: number | null,
    /** Duração total em segundos; nula quando o Google Drive não informa (aí não dá para avançar). */
    readonly durationSeconds: number | null,
    private readonly onFailure: () => void
  ) {}

  /** Devolve null quando o navegador não tem Media Source Extensions. */
  static async create(options: {
    video: HTMLVideoElement;
    url: string;
    sizeBytes: number | null;
    durationMs: number | null;
    onFailure: () => void;
  }): Promise<TransportStreamPlayer | null> {
    const mpegts = await loadMpegts();
    if (!mpegts.isSupported()) {
      return null;
    }
    const durationSeconds = options.durationMs === null ? null : options.durationMs / 1000;
    const instance = new TransportStreamPlayer(mpegts, options.video, options.url, options.sizeBytes, durationSeconds, options.onFailure);
    instance.startAt(0);
    return instance;
  }

  get canSeek(): boolean {
    return this.durationSeconds !== null && this.sizeBytes !== null && this.sizeBytes > 0;
  }

  /** Posição no vídeo inteiro, em segundos. */
  get position(): number {
    return this.baseTime + this.video.currentTime;
  }

  seek(targetSeconds: number): void {
    if (!this.canSeek || this.destroyed) return;
    const target = Math.min(Math.max(0, targetSeconds), Math.max(0, this.durationSeconds! - 1));

    // Já carregado: só move o vídeo, sem recomeçar a conversão.
    const local = target - this.baseTime;
    for (let index = 0; index < this.video.buffered.length; index += 1) {
      if (local >= this.video.buffered.start(index) && local <= this.video.buffered.end(index) - 0.5) {
        this.video.currentTime = local;
        return;
      }
    }
    this.startAt(target);
  }

  destroy(): void {
    this.destroyed = true;
    this.player?.destroy();
    this.player = null;
  }

  private startAt(targetSeconds: number): void {
    this.player?.destroy();

    const size = this.sizeBytes;
    const { offset, baseTime } = this.canSeek
      ? transportStreamStartPoint(targetSeconds, this.durationSeconds!, size!)
      : { offset: 0, baseTime: 0 };
    this.baseTime = baseTime;

    const player = this.mpegts.createPlayer(
      {
        type: 'mpegts',
        isLive: false,
        url: offset > 0 ? `${this.url}?start=${offset}` : this.url,
        ...(size !== null ? { filesize: size - offset } : {})
      },
      { seekType: 'range', lazyLoad: true, autoCleanupSourceBuffer: true }
    );
    player.on(this.mpegts.Events.ERROR, () => {
      if (this.player !== player) return; // erro de um player já substituído
      this.destroy();
      this.onFailure();
    });
    player.attachMediaElement(this.video);
    player.load();
    // O navegador pode bloquear o autoplay; o usuário ainda pode clicar em play.
    void Promise.resolve(player.play()).catch(() => undefined);
    this.player = player;
  }
}
