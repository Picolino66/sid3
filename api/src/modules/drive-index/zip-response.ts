import type { Response } from 'express';
import { buildAttachmentDisposition } from '../../common/http/content-disposition';
import { StorageProviderIntegrationCredentials } from '../storage-providers/dto/storage-provider.types';
import { DriveFolderZipService, DriveZipPlan, DriveZipResult } from './drive-folder-zip.service';

export type PreparedDriveZip = {
  credentials: StorageProviderIntegrationCredentials;
  plan: DriveZipPlan;
  zipName: string;
};

/** Envia o ZIP em streaming. Sem Content-Length: o tamanho final só é conhecido ao terminar. */
export function streamZipResponse(
  response: Response,
  zipService: DriveFolderZipService,
  zip: PreparedDriveZip
): Promise<DriveZipResult> {
  response.setHeader('Content-Type', 'application/zip');
  response.setHeader('Content-Disposition', buildAttachmentDisposition(zip.zipName));
  response.setHeader('X-Content-Type-Options', 'nosniff');
  return zipService.streamZip(zip.credentials, zip.plan, response);
}
