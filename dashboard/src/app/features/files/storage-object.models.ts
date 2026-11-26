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
  /** URL assinada (1h) relativa à base da API; presente nas listagens do painel. */
  downloadUrl?: string | null;
};

export type ObjectListResponse = {
  items: StorageObject[];
  /** Subpastas do prefixo atual (com barra final), só na primeira página. */
  folders: string[];
  nextCursor: string | null;
};

export type ListObjectsParams = {
  prefix?: string;
  cursor?: string | null;
  limit?: number;
  /** "/" navega por pastas; vazio lista tudo do prefixo em ordem de envio. */
  delimiter?: '/' | '';
};
