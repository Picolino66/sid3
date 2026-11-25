import { StorageObjectStatus } from '@prisma/client';
import { ReconciliationService } from './reconciliation.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ReconciliationService', () => {
  let prisma: {
    storageObject: {
      updateMany: jest.Mock;
    };
  };
  let service: ReconciliationService;

  beforeEach(() => {
    prisma = {
      storageObject: {
        updateMany: jest.fn()
      }
    };
    service = new ReconciliationService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    service.onApplicationShutdown();
  });

  it('marks stuck PENDING objects as FAILED', async () => {
    prisma.storageObject.updateMany.mockResolvedValue({ count: 3 });

    const result = await service.reconcileStuckPendingObjects(3600000);

    expect(result).toBe(3);
    expect(prisma.storageObject.updateMany).toHaveBeenCalledWith({
      where: {
        status: StorageObjectStatus.PENDING,
        createdAt: { lt: expect.any(Date) }
      },
      data: {
        status: StorageObjectStatus.FAILED
      }
    });
  });

  it('finalizes stuck DELETING objects as DELETED', async () => {
    prisma.storageObject.updateMany.mockResolvedValue({ count: 2 });

    const result = await service.reconcileStuckDeletingObjects(1800000);

    expect(result).toBe(2);
    expect(prisma.storageObject.updateMany).toHaveBeenCalledWith({
      where: {
        status: StorageObjectStatus.DELETING,
        updatedAt: { lt: expect.any(Date) }
      },
      data: {
        status: StorageObjectStatus.DELETED,
        deletedAt: expect.any(Date)
      }
    });
  });

  it('executes full reconciliation cycle aggregating all counts', async () => {
    prisma.storageObject.updateMany
      .mockResolvedValueOnce({ count: 4 })
      .mockResolvedValueOnce({ count: 1 });

    const result = await service.runReconciliation();

    expect(result.failedPending).toBe(4);
    expect(result.finalizedDeleting).toBe(1);
    expect(typeof result.cleanedFiles).toBe('number');
  });
});
