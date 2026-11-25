import { ApiProperty } from '@nestjs/swagger';

export const SHARE_LINK_STATUSES = ['ACTIVE', 'EXPIRED', 'REVOKED'] as const;
export type ShareLinkStatus = (typeof SHARE_LINK_STATUSES)[number];

export class ShareLinkItemResponseDto {
  @ApiProperty({ description: 'ID do item no Google Drive' })
  id!: string;

  @ApiProperty({ nullable: true, description: 'Nulo se o item não está mais no índice do Drive' })
  name!: string | null;

  @ApiProperty({ nullable: true })
  mimeType!: string | null;

  @ApiProperty()
  isFolder!: boolean;

  @ApiProperty({ description: 'O item ainda existe no índice e aparece para quem abre o link' })
  available!: boolean;
}

export class ShareLinkResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  connectionId!: string;

  @ApiProperty({ nullable: true })
  name!: string | null;

  @ApiProperty({ description: 'Token secreto do link; quem tiver o token acessa os itens' })
  token!: string;

  @ApiProperty({ example: '/s/Xb3...', description: 'Caminho da página pública no dashboard' })
  publicPath!: string;

  @ApiProperty({ enum: SHARE_LINK_STATUSES })
  status!: ShareLinkStatus;

  @ApiProperty({ format: 'date-time', nullable: true })
  expiresAt!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  revokedAt!: string | null;

  @ApiProperty()
  accessCount!: number;

  @ApiProperty({ format: 'date-time', nullable: true })
  lastAccessedAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: ShareLinkItemResponseDto, isArray: true })
  items!: ShareLinkItemResponseDto[];
}
