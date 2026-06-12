import { Module } from '@nestjs/common';
import { TokenEncryptionService } from '../../common/security/token-encryption.service';
import { GoogleDriveStorageProvider } from './google-drive-storage.provider';
import { StorageProviderRegistry } from './storage-provider.registry';

@Module({
  providers: [GoogleDriveStorageProvider, StorageProviderRegistry, TokenEncryptionService],
  exports: [StorageProviderRegistry, GoogleDriveStorageProvider]
})
export class StorageProvidersModule {}
