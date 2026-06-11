export type ConnectionStatus = 'CONNECTED' | 'REVOKED' | 'ERROR';

export type Connection = {
  id: string;
  provider: 'GOOGLE_DRIVE';
  displayName: string | null;
  providerAccountEmail: string | null;
  status: ConnectionStatus;
  scopes: string[];
  createdAt: string;
};

export type OAuthAuthorizeResponse = {
  authorizationUrl: string;
  stateExpiresAt: string;
};

export type OAuthCallbackRequest = {
  code: string;
  state: string;
};

export type UpdateConnectionRequest = {
  displayName: string | null;
};
