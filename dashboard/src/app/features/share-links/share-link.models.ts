export type ShareLinkStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED';

export type ShareLinkItem = {
  id: string;
  name: string | null;
  mimeType: string | null;
  isFolder: boolean;
  available: boolean;
};

export type ShareLink = {
  id: string;
  connectionId: string;
  name: string | null;
  token: string;
  publicPath: string;
  status: ShareLinkStatus;
  expiresAt: string | null;
  revokedAt: string | null;
  accessCount: number;
  lastAccessedAt: string | null;
  createdAt: string;
  items: ShareLinkItem[];
};

export type CreateShareLinkRequest = {
  connectionId: string;
  fileIds: string[];
  name?: string;
  expiresInDays?: number;
};

export type PublicShareItem = {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  isSharedDrive: boolean;
  sizeBytes: number | null;
  modifiedTime: string | null;
  downloadable: boolean;
  exportExtension: string | null;
  /** Imagem, vídeo ou áudio que pode ser exibido/tocado no navegador. */
  previewKind: PublicPreviewKind | null;
};

export type PublicPreviewKind = 'image' | 'video' | 'audio';

export type PublicSearchItem = PublicShareItem & {
  /** Pastas desde o item compartilhado até o resultado (sem o próprio resultado). */
  path: string[];
  /** Pasta onde o resultado está; nulo quando ele é um dos itens do link. */
  parentId: string | null;
};

export type PublicSearchResult = {
  query: string;
  items: PublicSearchItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type PublicShare = {
  name: string | null;
  sharedBy: string | null;
  createdAt: string;
  expiresAt: string | null;
  items: PublicShareItem[];
};

export type PublicFolderCrumb = { id: string; name: string };

export type PublicFolderList = {
  folder: PublicFolderCrumb;
  breadcrumb: PublicFolderCrumb[];
  items: PublicShareItem[];
  total: number;
  page: number;
  pageSize: number;
};

/** URL completa da página pública a partir do caminho devolvido pela API. */
export function shareLinkUrl(link: Pick<ShareLink, 'publicPath'>): string {
  return `${window.location.origin}${link.publicPath}`;
}
