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
  lastError: string | null;
  lastErrorAt: string | null;
  /** Projetos onde esta conexão está disponível. */
  projects: { id: string; name: string }[];
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

export const DEFAULT_CONNECTION_DISPLAY_NAME = 'GOOGLE_DRIVE';

export type CreateGoogleAuthorizationRequest = {
  displayName: string | null;
};

export type OAuthCallbackRequest = {
  code: string;
  state: string;
};

export type UpdateConnectionRequest = {
  displayName: string | null;
};
