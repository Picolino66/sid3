export type StorageObjectStatus = 'PENDING' | 'AVAILABLE' | 'DELETING' | 'DELETED' | 'FAILED';

export type StorageObject = {
  id: string;
  bucketId: string;
  key: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256: string | null;
  status: StorageObjectStatus;
  createdAt: string;
  updatedAt: string;
};

export type ObjectListResponse = {
  items: StorageObject[];
  nextCursor: string | null;
};
