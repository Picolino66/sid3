import { ConnectionStatus } from '../connections/connection.models';

export type PoolRoutingStrategy = 'ROUND_ROBIN' | 'FILL_FIRST' | 'WEIGHTED';

export type PoolMember = {
  id: string;
  connectionId: string;
  provider: 'GOOGLE_DRIVE';
  displayName: string | null;
  providerAccountEmail: string | null;
  connectionStatus: ConnectionStatus;
  weight: number;
  createdAt: string;
};

export type StoragePool = {
  id: string;
  projectId: string;
  name: string;
  strategy: PoolRoutingStrategy;
  members: PoolMember[];
  createdAt: string;
  updatedAt: string;
};

export type CreateStoragePoolRequest = {
  name: string;
  strategy?: PoolRoutingStrategy;
};

export type AddPoolMemberRequest = {
  connectionId: string;
  weight?: number;
};
