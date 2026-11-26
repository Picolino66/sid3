import { ConnectionStatus, Sid3RootFolderStatus } from '../connections/connection.models';

export type Project = {
  id: string;
  name: string;
  slug: string;
  connectionCount: number;
  bucketCount: number;
  createdAt: string;
};

export type CreateProjectRequest = {
  name: string;
};

export type UpdateProjectRequest = {
  name: string;
};

/** Conexão disponível num projeto (vínculo projeto ↔ conexão). */
export type ProjectConnection = {
  connectionId: string;
  displayName: string | null;
  providerAccountEmail: string | null;
  status: ConnectionStatus;
  sid3RootFolderStatus: Sid3RootFolderStatus;
  lastError: string | null;
  canBrowseDrive: boolean;
  bucketCount: number;
  linkedAt: string;
};

export type ProjectAlertSeverity = 'critical' | 'warning' | 'info';

export type ProjectAlert = {
  severity: ProjectAlertSeverity;
  code: string;
  message: string;
  connectionId: string | null;
  bucketId: string | null;
};

export type ProjectOverview = {
  projectId: string;
  projectName: string;
  totals: {
    objectCount: number;
    totalBytes: number;
    bucketCount: number;
    connectionCount: number;
    activeApiKeyCount: number;
    failedUploads24h: number;
    uploads24h: number;
  };
  setup: {
    hasConnection: boolean;
    hasBucket: boolean;
    hasApiKey: boolean;
    hasObject: boolean;
  };
  alerts: ProjectAlert[];
};
