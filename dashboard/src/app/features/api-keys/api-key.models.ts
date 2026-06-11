export type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type CreateApiKeyRequest = {
  name: string;
};

export type ApiKeyCreated = {
  apiKey: ApiKey;
  secret: string;
};
