import { Provider } from '@prisma/client';
import { GoogleDriveStorageProvider } from './google-drive-storage.provider';
import { StorageProviderRegistry } from './storage-provider.registry';

describe(StorageProviderRegistry.name, () => {
  it('returns the registered Google Drive provider', () => {
    const googleDriveProvider = {
      provider: Provider.GOOGLE_DRIVE
    } as GoogleDriveStorageProvider;
    const registry = new StorageProviderRegistry(googleDriveProvider);

    expect(registry.getProvider(Provider.GOOGLE_DRIVE)).toBe(googleDriveProvider);
  });

  it('rejects providers that are not registered', () => {
    const googleDriveProvider = {
      provider: Provider.GOOGLE_DRIVE
    } as GoogleDriveStorageProvider;
    const registry = new StorageProviderRegistry(googleDriveProvider);

    expect(() => registry.getProvider('UNSUPPORTED_PROVIDER' as Provider)).toThrow(
      'Storage provider UNSUPPORTED_PROVIDER is not registered'
    );
  });
});
