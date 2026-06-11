export type OperationType =
  | 'UPLOAD'
  | 'DOWNLOAD'
  | 'LIST'
  | 'DELETE'
  | 'OAUTH_CONNECT'
  | 'OAUTH_REVOKE'
  | 'API_KEY_CREATE'
  | 'API_KEY_REVOKE';

export type OperationStatus = 'SUCCESS' | 'FAILED';

export type Provider = 'GOOGLE_DRIVE';

export type OperationLog = {
  id: string;
  projectId: string;
  apiKeyId: string | null;
  bucketId: string | null;
  objectId: string | null;
  operation: OperationType;
  status: OperationStatus;
  provider: Provider | null;
  errorCode: string | null;
  requestId: string;
  createdAt: string;
};
