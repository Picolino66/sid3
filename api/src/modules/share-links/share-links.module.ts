import { Module } from '@nestjs/common';
import { TokenEncryptionService } from '../../common/security/token-encryption.service';
import { DriveIndexModule } from '../drive-index/drive-index.module';
import { StorageProvidersModule } from '../storage-providers/storage-providers.module';
import { PublicSharesController } from './public-shares.controller';
import { PublicSharesService } from './public-shares.service';
import { ShareLinksController } from './share-links.controller';
import { ShareLinksService } from './share-links.service';

@Module({
  imports: [StorageProvidersModule, DriveIndexModule],
  controllers: [ShareLinksController, PublicSharesController],
  providers: [ShareLinksService, PublicSharesService, TokenEncryptionService]
})
export class ShareLinksModule {}
