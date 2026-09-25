import { Module } from '@nestjs/common';
import { TokenEncryptionService } from '../../common/security/token-encryption.service';
import { StorageProvidersModule } from '../storage-providers/storage-providers.module';
import { GoogleOAuthClient } from './google-oauth.client';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';

@Module({
  imports: [StorageProvidersModule],
  controllers: [ConnectionsController],
  providers: [GoogleOAuthClient, ConnectionsService, TokenEncryptionService],
  exports: [ConnectionsService]
})
export class ConnectionsModule {}
