import { ConnectionStatus } from '../connections/connection.models';

export type ConnectionStorageSummary = {
  connectionId: string;
  displayName: string | null;
  providerAccountEmail: string | null;
  provider: 'GOOGLE_DRIVE';
  status: ConnectionStatus;
  sizeBytes: string;
  objectCount: number;
  driveQuotaLimitBytes: string | null;
  driveQuotaUsageBytes: string | null;
  driveQuotaUsageInDriveBytes: string | null;
};

export type BucketStorageSummary = {
  bucketId: string;
  bucketName: string;
  sizeBytes: string;
  objectCount: number;
};

export type ProjectStorageStats = {
  totalSizeBytes: string;
  totalObjectCount: number;
  byConnection: ConnectionStorageSummary[];
  byBucket: BucketStorageSummary[];
};
