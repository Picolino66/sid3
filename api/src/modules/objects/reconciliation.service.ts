import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { StorageObjectStatus } from '@prisma/client';
import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { getUploadTempDirectory } from '../../config/upload.config';
import { PrismaService } from '../prisma/prisma.service';

export interface ReconciliationResult {
  cleanedFiles: number;
  failedPending: number;
  finalizedDeleting: number;
}

@Injectable()
export class ReconciliationService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ReconciliationService.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly RECONCILIATION_INTERVAL_MS = 30 * 60 * 1000; // a cada 30 minutos

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap(): void {
    // Agenda primeira execução em 5 segundos após inicialização
    const initialTimeout = setTimeout(() => {
      void this.runReconciliation().catch((error) => {
        this.logger.error('Erro na reconciliação inicial:', error);
      });
    }, 5000);
    initialTimeout.unref();

    // Executa periodicamente a cada 30 minutos
    this.timer = setInterval(() => {
      void this.runReconciliation().catch((error) => {
        this.logger.error('Erro no ciclo periódico de reconciliação:', error);
      });
    }, this.RECONCILIATION_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runReconciliation(): Promise<ReconciliationResult> {
    this.logger.log('Iniciando ciclo de reconciliação de arquivos e objetos...');

    const [cleanedFiles, failedPending, finalizedDeleting] = await Promise.all([
      this.cleanupOrphanTempFiles(),
      this.reconcileStuckPendingObjects(),
      this.reconcileStuckDeletingObjects()
    ]);

    this.logger.log(
      `Reconciliação finalizada: ${cleanedFiles} arquivos temporários limpos, ${failedPending} objetos pendentes marcados como falhos, ${finalizedDeleting} exclusões finalizadas.`
    );

    return { cleanedFiles, failedPending, finalizedDeleting };
  }

  async cleanupOrphanTempFiles(maxAgeMs = 60 * 60 * 1000): Promise<number> {
    let count = 0;
    try {
      const tempDir = getUploadTempDirectory();
      const files = await readdir(tempDir);
      const now = Date.now();

      for (const file of files) {
        const filePath = join(tempDir, file);
        try {
          const fileStat = await stat(filePath);
          if (fileStat.isFile() && now - fileStat.mtimeMs > maxAgeMs) {
            await unlink(filePath);
            count++;
          }
        } catch {
          // Arquivo pode ter sido removido concorrentemente por outro processo
        }
      }
    } catch (error) {
      this.logger.warn('Aviso ao varrer diretório temporário para limpeza:', error);
    }
    return count;
  }

  async reconcileStuckPendingObjects(maxAgeMs = 60 * 60 * 1000): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeMs);

    const result = await this.prisma.storageObject.updateMany({
      where: {
        status: StorageObjectStatus.PENDING,
        createdAt: { lt: cutoff }
      },
      data: {
        status: StorageObjectStatus.FAILED
      }
    });

    return result.count;
  }

  async reconcileStuckDeletingObjects(maxAgeMs = 30 * 60 * 1000): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeMs);

    const result = await this.prisma.storageObject.updateMany({
      where: {
        status: StorageObjectStatus.DELETING,
        updatedAt: { lt: cutoff }
      },
      data: {
        status: StorageObjectStatus.DELETED,
        deletedAt: new Date()
      }
    });

    return result.count;
  }
}
