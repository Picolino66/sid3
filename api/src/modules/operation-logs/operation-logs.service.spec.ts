import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { OperationStatus, OperationType, Provider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OperationLogsService } from './operation-logs.service';

describe(OperationLogsService.name, () => {
  const ownerUserId = '43d53e3f-84a8-4936-acdc-4d89d28a9367';
  const projectId = '5a25fdf3-2141-413b-970e-e008e314fe93';
  const createdAt = new Date('2026-05-24T15:00:00.000Z');

  let prisma: {
    project: { findFirst: jest.Mock };
    operationLog: { findMany: jest.Mock };
  };
  let service: OperationLogsService;

  beforeEach(() => {
    prisma = {
      project: {
        findFirst: jest.fn().mockResolvedValue({ id: projectId })
      },
      operationLog: {
        findMany: jest.fn()
      }
    };
    service = new OperationLogsService(prisma as unknown as PrismaService);
  });

  it('lists logs for an owned project', async () => {
    prisma.operationLog.findMany.mockResolvedValue([
      {
        id: 'log-id',
        projectId,
        apiKeyId: 'api-key-id',
        bucketId: 'bucket-id',
        objectId: 'object-id',
        operation: OperationType.UPLOAD,
        status: OperationStatus.SUCCESS,
        provider: Provider.GOOGLE_DRIVE,
        errorCode: null,
        requestId: 'request-id',
        createdAt
      }
    ]);

    const response = await service.listLogs(ownerUserId, projectId, { limit: '25' });

    expect(prisma.project.findFirst).toHaveBeenCalledWith({
      where: { id: projectId, ownerUserId },
      select: { id: true }
    });
    expect(prisma.operationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId },
        take: 25
      })
    );
    expect(response).toEqual([
      {
        id: 'log-id',
        projectId,
        apiKeyId: 'api-key-id',
        bucketId: 'bucket-id',
        objectId: 'object-id',
        operation: OperationType.UPLOAD,
        status: OperationStatus.SUCCESS,
        provider: Provider.GOOGLE_DRIVE,
        errorCode: null,
        requestId: 'request-id',
        createdAt: createdAt.toISOString()
      }
    ]);
  });

  it('rejects logs for projects outside the current user', async () => {
    prisma.project.findFirst.mockResolvedValue(null);

    await expect(service.listLogs(ownerUserId, projectId, {})).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects invalid limits', async () => {
    await expect(service.listLogs(ownerUserId, projectId, { limit: '500' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
