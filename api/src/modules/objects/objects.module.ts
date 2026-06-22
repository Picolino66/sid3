import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import { ApiKeyAuthGuard } from '../../common/auth/api-key-auth.guard';
import { getMaxUploadBytes, getUploadTempDirectory } from '../../config/upload.config';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { StorageProvidersModule } from '../storage-providers/storage-providers.module';
import { StoragePoolsModule } from '../storage-pools/storage-pools.module';
import { ObjectsController } from './objects.controller';
import { ObjectsService } from './objects.service';
import { UploadCleanupInterceptor } from './upload-cleanup.interceptor';
import { UploadProblemDetailsFilter } from './upload-problem-details.filter';

@Module({
  imports: [
    ApiKeysModule,
    StorageProvidersModule,
    StoragePoolsModule,
    MulterModule.register({
      storage: diskStorage({
        destination: getUploadTempDirectory(),
        filename: (_request, _file, callback) => callback(null, randomUUID())
      }),
      limits: { fileSize: getMaxUploadBytes(), files: 1 }
    })
  ],
  controllers: [ObjectsController],
  providers: [ApiKeyAuthGuard, ObjectsService, UploadCleanupInterceptor, UploadProblemDetailsFilter],
  exports: [ObjectsService]
})
export class ObjectsModule {}
