export type Bucket = {
  id: string;
  projectId: string;
  name: string;
  providerIntegrationId: string | null;
  storagePoolId: string | null;
  createdAt: string;
};

export type CreateBucketRequest = {
  name: string;
  providerIntegrationId?: string;
  storagePoolId?: string;
};
