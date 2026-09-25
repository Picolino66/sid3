export type ConnectionStatus = 'CONNECTED' | 'REVOKED' | 'ERROR';

export type Sid3RootFolderStatus = 'NOT_RESOLVED' | 'PENDING_CONFIRMATION' | 'CONFIRMED';

export type Connection = {
  id: string;
  provider: 'GOOGLE_DRIVE';
  displayName: string | null;
  providerAccountEmail: string | null;
  status: ConnectionStatus;
  scopes: string[];
  sid3RootFolderStatus: Sid3RootFolderStatus;
  createdAt: string;
};

export type Sid3RootFolderDecision = 'CONFIRM' | 'DECLINE';

export type ConfirmSid3RootFolderRequest = {
  decision: Sid3RootFolderDecision;
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
