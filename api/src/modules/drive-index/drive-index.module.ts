import { Module } from '@nestjs/common';
import { StorageProvidersModule } from '../storage-providers/storage-providers.module';
import { DriveFilesService } from './drive-files.service';
import { DriveFolderZipService } from './drive-folder-zip.service';
import { DriveIndexController } from './drive-index.controller';
import { DriveIndexSyncService } from './drive-index-sync.service';

@Module({
  imports: [StorageProvidersModule],
  controllers: [DriveIndexController],
  providers: [DriveIndexSyncService, DriveFilesService, DriveFolderZipService],
  exports: [DriveIndexSyncService, DriveFolderZipService]
})
export class DriveIndexModule {}
