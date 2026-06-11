import { Module } from '@nestjs/common';
import { ApiKeyAuthGuard } from '../../common/auth/api-key-auth.guard';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { StorageProvidersModule } from '../storage-providers/storage-providers.module';
import { StoragePoolsModule } from '../storage-pools/storage-pools.module';
import { ObjectsController } from './objects.controller';
import { ObjectsService } from './objects.service';

@Module({
  imports: [ApiKeysModule, StorageProvidersModule, StoragePoolsModule],
  controllers: [ObjectsController],
  providers: [ApiKeyAuthGuard, ObjectsService],
  exports: [ObjectsService]
})
export class ObjectsModule {}
