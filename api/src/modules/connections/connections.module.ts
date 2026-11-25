import { Module } from '@nestjs/common';
import { TokenEncryptionService } from '../../common/security/token-encryption.service';
import { DriveIndexModule } from '../drive-index/drive-index.module';
import { StorageProvidersModule } from '../storage-providers/storage-providers.module';
import { GoogleOAuthClient } from './google-oauth.client';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';

@Module({
  imports: [StorageProvidersModule, DriveIndexModule],
  controllers: [ConnectionsController],
  providers: [GoogleOAuthClient, ConnectionsService, TokenEncryptionService],
  exports: [ConnectionsService]
})
export class ConnectionsModule {}
