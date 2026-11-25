export type DriveIndexStatusValue = 'NEVER_INDEXED' | 'INDEXING' | 'READY' | 'FAILED';

export type DriveIndexRefreshMode = 'incremental' | 'full';

export type DriveIndexStatus = {
  connectionId: string;
  status: DriveIndexStatusValue;
  hasReadScope: boolean;
  startedAt: string | null;
  lastIndexedAt: string | null;
  itemCount: number;
  lastError: string | null;
};

export type DriveFile = {
  id: string;
  parentId: string | null;
  driveId: string | null;
  isSharedDrive: boolean;
  name: string;
  mimeType: string;
  isFolder: boolean;
  sizeBytes: number | null;
  md5Checksum: string | null;
  modifiedTime: string | null;
  webViewLink: string | null;
  downloadable: boolean;
  exportExtension: string | null;
  indexedAt: string;
};

export type DriveFolderCrumb = {
  id: string;
  name: string;
};

export type DriveFileListSection = 'my-drive' | 'shared-drives' | 'shared-with-me' | 'search';

export type DriveFileList = {
  items: DriveFile[];
  total: number;
  page: number;
  pageSize: number;
  parentId: string | null;
  section: DriveFileListSection;
  breadcrumb: DriveFolderCrumb[];
};

/**
 * "root" = raiz do Meu Drive; "shared-drives" = lista de drives compartilhados;
 * "shared" = itens compartilhados comigo sem pasta pai visível.
 */
export const DRIVE_ROOT = 'root';
export const DRIVE_SHARED_DRIVES = 'shared-drives';
export const DRIVE_SHARED = 'shared';

export type ListDriveFilesParams = {
  parentId?: string;
  q?: string;
  page?: number;
  pageSize?: number;
};
