import { Module } from '@nestjs/common';
import { TokenEncryptionService } from '../../common/security/token-encryption.service';
import { GoogleOAuthClient } from './google-oauth.client';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';

@Module({
  controllers: [ConnectionsController],
  providers: [GoogleOAuthClient, ConnectionsService, TokenEncryptionService],
  exports: [ConnectionsService]
})
export class ConnectionsModule {}
