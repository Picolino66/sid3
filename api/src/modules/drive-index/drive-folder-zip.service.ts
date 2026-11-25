import { Injectable, Logger, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DriveIndexEntry } from '@prisma/client';
import archiver, { Archiver } from 'archiver';
import { EventEmitter } from 'events';
import { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';
import { StorageProviderIntegrationCredentials } from '../storage-providers/dto/storage-provider.types';
import {
  GOOGLE_WORKSPACE_EXPORT_FORMATS,
  GoogleDriveStorageProvider,
  isDriveFileDownloadable
} from '../storage-providers/google-drive-storage.provider';

export type DriveZipPlanEntry =
  | { kind: 'directory'; path: string }
  | { kind: 'file'; path: string; entry: DriveIndexEntry };

export type DriveZipPlan = {
  entries: DriveZipPlanEntry[];
  /** Itens que não entram no ZIP (ex.: Formulários Google), listados no arquivo de aviso. */
  skipped: { path: string; reason: string }[];
  fileCount: number;
  totalBytes: number;
};

export type DriveZipResult = { filesWritten: number; failures: { path: string; reason: string }[]; aborted: boolean };

/** Destino do ZIP (a resposta HTTP); 'close' antes do fim significa que o cliente desistiu. */
export type DriveZipDestination = NodeJS.WritableStream & EventEmitter;

const DEFAULT_MAX_FILES = 5000;
const DEFAULT_MAX_BYTES = 10 * 1024 ** 3;
const CHILDREN_QUERY_BATCH = 200;
const MAX_NAME_LENGTH = 180;
const NOTICE_FILE_NAME = 'LEIA-ME - arquivos nao incluidos.txt';

/** Já comprimidos: armazenar sem deflate economiza CPU sem perder tamanho. */
const PRECOMPRESSED_MIME = /^(image\/(jpeg|png|gif|webp|heic|heif|avif)|video\/|audio\/|application\/(zip|x-7z-compressed|x-rar-compressed|vnd\.rar|gzip|x-gzip|pdf))/i;

/**
 * Monta e transmite um ZIP com o conteúdo de pastas do índice do Drive, em streaming:
 * um arquivo por vez é baixado do Google e escrito no ZIP, sem ocupar disco nem memória.
 */
@Injectable()
export class DriveFolderZipService {
  private readonly logger = new Logger(DriveFolderZipService.name);
  private readonly maxFiles: number;
  private readonly maxBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly driveProvider: GoogleDriveStorageProvider,
    configService: ConfigService
  ) {
    this.maxFiles = this.positiveNumber(configService.get<string>('SID3_ZIP_MAX_FILES'), DEFAULT_MAX_FILES);
    this.maxBytes = this.positiveNumber(configService.get<string>('SID3_ZIP_MAX_MB'), DEFAULT_MAX_BYTES / 1024 ** 2) * 1024 ** 2;
  }

  /** Percorre as pastas no índice (por nível, em lotes) e define o caminho de cada item dentro do ZIP. */
  async buildPlan(connectionId: string, roots: DriveIndexEntry[]): Promise<DriveZipPlan> {
    const plan: DriveZipPlan = { entries: [], skipped: [], fileCount: 0, totalBytes: 0 };
    const namesByDirectory = new Map<string, Set<string>>();
    const visitedFolders = new Set<string>();
    let pendingFolders: { entry: DriveIndexEntry; path: string }[] = [];

    const addEntry = (entry: DriveIndexEntry, directoryPath: string): void => {
      if (entry.isFolder) {
        if (visitedFolders.has(entry.providerFileId)) return;
        visitedFolders.add(entry.providerFileId);
        const path = `${directoryPath}${this.uniqueName(namesByDirectory, directoryPath, this.sanitizeName(entry.name))}/`;
        plan.entries.push({ kind: 'directory', path });
        pendingFolders.push({ entry, path });
        return;
      }

      const exportExtension = GOOGLE_WORKSPACE_EXPORT_FORMATS[entry.mimeType]?.extension;
      const baseName = this.sanitizeName(entry.name);
      const fileName = exportExtension && !baseName.toLowerCase().endsWith(`.${exportExtension}`)
        ? `${baseName}.${exportExtension}`
        : baseName;

      if (!isDriveFileDownloadable(entry.mimeType)) {
        plan.skipped.push({ path: `${directoryPath}${baseName}`, reason: `tipo ${entry.mimeType} não pode ser baixado` });
        return;
      }

      plan.entries.push({ kind: 'file', path: `${directoryPath}${this.uniqueName(namesByDirectory, directoryPath, fileName)}`, entry });
      plan.fileCount += 1;
      plan.totalBytes += entry.sizeBytes === null ? 0 : Number(entry.sizeBytes);
      this.assertWithinLimits(plan);
    };

    [...roots].sort((a, b) => a.name.localeCompare(b.name)).forEach((root) => addEntry(root, ''));

    while (pendingFolders.length > 0) {
      const batch = pendingFolders.slice(0, CHILDREN_QUERY_BATCH);
      pendingFolders = pendingFolders.slice(CHILDREN_QUERY_BATCH);
      const pathByFolderId = new Map(batch.map((folder) => [folder.entry.providerFileId, folder.path]));

      const children = await this.prisma.driveIndexEntry.findMany({
        where: { providerIntegrationId: connectionId, parentFileId: { in: [...pathByFolderId.keys()] } },
        orderBy: [{ isFolder: 'desc' }, { name: 'asc' }]
      });

      for (const child of children) {
        addEntry(child, pathByFolderId.get(child.parentFileId!)!);
      }
    }

    return plan;
  }

  /** Escreve o ZIP no destino. Falhas de arquivos individuais não interrompem o ZIP: vão para o aviso. */
  async streamZip(
    credentials: StorageProviderIntegrationCredentials,
    plan: DriveZipPlan,
    destination: DriveZipDestination
  ): Promise<DriveZipResult> {
    const archive = archiver('zip', { zlib: { level: 6 } });
    const result: DriveZipResult = { filesWritten: 0, failures: [], aborted: false };
    const abortController = new AbortController();
    let finished = false;
    // 'end' do archiver acontece antes do 'close' do destino num ZIP completo.
    archive.on('end', () => {
      finished = true;
    });

    destination.on('close', () => {
      if (!finished) {
        result.aborted = true;
        abortController.abort();
        archive.abort();
      }
    });
    archive.on('warning', (warning) => this.logger.warn(`ZIP warning: ${warning.message}`));
    // Listener permanente: sem ele, um erro do archiver fora de um append derrubaria o processo.
    archive.on('error', (error) => this.logger.error(`ZIP archive error: ${error.message}`));
    archive.pipe(destination);

    try {
      for (const item of plan.entries) {
        if (result.aborted) break;

        if (item.kind === 'directory') {
          archive.append(Buffer.alloc(0), { name: item.path, type: 'directory' } as archiver.EntryData);
          continue;
        }

        let source: Readable;
        try {
          const content = await this.driveProvider.downloadDriveFile(credentials, {
            providerFileId: item.entry.providerFileId,
            name: item.entry.name,
            mimeType: item.entry.mimeType,
            sizeBytes: item.entry.sizeBytes === null ? null : Number(item.entry.sizeBytes)
          });
          source = content.stream;
        } catch (error) {
          // O aviso vai dentro do ZIP (inclusive em links públicos): só o detalhe genérico; o resto fica no log.
          this.logger.warn(`ZIP skipped file=${item.entry.providerFileId.slice(0, 8)} reason=${this.describeError(error)}`);
          result.failures.push({ path: item.path, reason: 'não foi possível obter o arquivo do Google Drive' });
          continue;
        }

        if (result.aborted) {
          source.destroy();
          break;
        }

        await this.appendAndWait(archive, source, item.path, PRECOMPRESSED_MIME.test(item.entry.mimeType), abortController.signal);
        if (!result.aborted) {
          result.filesWritten += 1;
        }
      }

      if (!result.aborted) {
        const notice = this.buildNotice(plan.skipped, result.failures);
        if (notice) {
          archive.append(notice, { name: NOTICE_FILE_NAME });
        }
        await archive.finalize();
      }
    } catch (error) {
      // Erro no meio do streaming: os cabeçalhos já foram enviados, então só resta interromper a resposta.
      this.logger.error(`ZIP stream failed: ${this.describeError(error)}`);
      result.aborted = true;
      archive.abort();
      if ('destroy' in destination && typeof destination.destroy === 'function') {
        destination.destroy();
      }
    } finally {
      finished = true;
    }

    return result;
  }

  /**
   * Espera o arquivo ser totalmente escrito antes de abrir o próximo download no Google.
   * Se o cliente desconectar no meio, encerra o download do Google e libera a espera.
   */
  private appendAndWait(
    archive: Archiver,
    source: Readable,
    name: string,
    store: boolean,
    signal: AbortSignal
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        source.destroy();
        resolve();
        return;
      }
      const onAbort = (): void => {
        cleanup();
        source.destroy();
        resolve();
      };
      const onEntry = (entry: archiver.EntryData): void => {
        if (entry.name === name) {
          cleanup();
          resolve();
        }
      };
      const onError = (error: Error): void => {
        cleanup();
        reject(error);
      };
      const cleanup = (): void => {
        archive.off('entry', onEntry);
        archive.off('error', onError);
        source.off('error', onError);
        signal.removeEventListener('abort', onAbort);
      };

      signal.addEventListener('abort', onAbort);
      archive.on('entry', onEntry);
      archive.on('error', onError);
      source.on('error', onError);
      archive.append(source, { name, store });
    });
  }

  private buildNotice(skipped: DriveZipPlan['skipped'], failures: DriveZipResult['failures']): string | null {
    const lines = [...skipped, ...failures].map((item) => `- ${item.path}: ${item.reason}`);
    if (lines.length === 0) return null;
    return [
      'Alguns itens não foram incluídos neste ZIP:',
      '',
      ...lines,
      '',
      'Formulários, Sites e atalhos do Google não têm conteúdo para baixar.',
      'Documentos Google muito grandes podem ultrapassar o limite de exportação do Google.',
      ''
    ].join('\n');
  }

  private assertWithinLimits(plan: DriveZipPlan): void {
    if (plan.fileCount > this.maxFiles) {
      throw new PayloadTooLargeException(
        `A pasta tem mais de ${this.maxFiles} arquivos. Baixe subpastas separadamente.`
      );
    }
    if (plan.totalBytes > this.maxBytes) {
      throw new PayloadTooLargeException(
        `A pasta passa de ${Math.round(this.maxBytes / 1024 ** 3)} GB. Baixe subpastas separadamente.`
      );
    }
  }

  /** Nome seguro em qualquer sistema: sem barras, caracteres reservados do Windows, "." ou "..". */
  sanitizeName(name: string): string {
    const cleaned = name
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
      .trim()
      .replace(/[. ]+$/, '')
      .slice(0, MAX_NAME_LENGTH);
    return cleaned === '' || cleaned === '.' || cleaned === '..' ? '_' : cleaned;
  }

  /** Evita colisão de nomes na mesma pasta (comparação sem diferenciar maiúsculas): "a.txt", "a (2).txt"... */
  private uniqueName(namesByDirectory: Map<string, Set<string>>, directoryPath: string, name: string): string {
    const used = namesByDirectory.get(directoryPath) ?? new Set<string>();
    namesByDirectory.set(directoryPath, used);

    const dot = name.lastIndexOf('.');
    const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
    let candidate = name;
    for (let counter = 2; used.has(candidate.toLowerCase()); counter += 1) {
      candidate = `${stem} (${counter})${extension}`;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  }

  private positiveNumber(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private describeError(error: unknown): string {
    return error instanceof Error && error.message ? error.message.slice(0, 300) : 'erro desconhecido';
  }
}
