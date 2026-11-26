import { Module } from '@nestjs/common';
import { TokenEncryptionService } from '../../common/security/token-encryption.service';
import { GoogleDriveStorageProvider } from './google-drive-storage.provider';
import { StorageProviderRegistry } from './storage-provider.registry';
import { ConnectionHealthService } from './connection-health.service';

@Module({
  providers: [GoogleDriveStorageProvider, StorageProviderRegistry, TokenEncryptionService, ConnectionHealthService],
  exports: [StorageProviderRegistry, GoogleDriveStorageProvider, ConnectionHealthService]
})
export class StorageProvidersModule {}
