import { Module } from '@nestjs/common';
import { ApiKeySecretService } from './api-key-secret.service';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';

@Module({
  controllers: [ApiKeysController],
  providers: [ApiKeySecretService, ApiKeysService],
  exports: [ApiKeysService, ApiKeySecretService]
})
export class ApiKeysModule {}
