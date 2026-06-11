import { Injectable } from '@nestjs/common';
import { Provider } from '@prisma/client';
import { GoogleDriveStorageProvider } from './google-drive-storage.provider';
import { StorageProviderPort } from './dto/storage-provider.types';

@Injectable()
export class StorageProviderRegistry {
  private readonly providers: Map<Provider, StorageProviderPort>;

  constructor(googleDriveStorageProvider: GoogleDriveStorageProvider) {
    this.providers = new Map([[googleDriveStorageProvider.provider, googleDriveStorageProvider]]);
  }

  getProvider(provider: Provider): StorageProviderPort {
    const storageProvider = this.providers.get(provider);

    if (!storageProvider) {
      throw new Error(`Storage provider ${provider} is not registered`);
    }

    return storageProvider;
  }
}
