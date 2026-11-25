import { ApiProperty } from '@nestjs/swagger';

/** Item visto por quem abre um link público: sem dados internos (checksum, link do Drive, IDs de conexão). */
export class PublicShareItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  mimeType!: string;

  @ApiProperty()
  isFolder!: boolean;

  @ApiProperty()
  isSharedDrive!: boolean;

  @ApiProperty({ nullable: true })
  sizeBytes!: number | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  modifiedTime!: string | null;

  @ApiProperty()
  downloadable!: boolean;

  @ApiProperty({ nullable: true, example: 'docx' })
  exportExtension!: string | null;

  @ApiProperty({
    nullable: true,
    enum: ['image', 'video', 'audio'],
    description: 'Tipo de pré-visualização disponível em /files/{fileId}/content; nulo quando não há'
  })
  previewKind!: 'image' | 'video' | 'audio' | null;
}

export class PublicMediaInfoDto {
  @ApiProperty({ nullable: true, description: 'Duração do vídeo em milissegundos, segundo o Google Drive' })
  durationMs!: number | null;
}

export class PublicSearchItemDto extends PublicShareItemDto {
  @ApiProperty({ type: [String], description: 'Pastas do item compartilhado até o item (sem o próprio item)' })
  path!: string[];

  @ApiProperty({ nullable: true, description: 'Pasta onde o item está; nulo quando o item é um dos itens do link' })
  parentId!: string | null;
}

export class PublicSearchResponseDto {
  @ApiProperty()
  query!: string;

  @ApiProperty({ type: [PublicSearchItemDto] })
  items!: PublicSearchItemDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;
}

export class PublicShareResponseDto {
  @ApiProperty({ nullable: true })
  name!: string | null;

  @ApiProperty({ nullable: true, description: 'Nome de quem compartilhou' })
  sharedBy!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time', nullable: true })
  expiresAt!: string | null;

  @ApiProperty({ type: PublicShareItemDto, isArray: true })
  items!: PublicShareItemDto[];
}

export class PublicFolderCrumbDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;
}

export class PublicFolderListResponseDto {
  @ApiProperty({ type: PublicFolderCrumbDto })
  folder!: PublicFolderCrumbDto;

  @ApiProperty({
    type: PublicFolderCrumbDto,
    isArray: true,
    description: 'Caminho a partir do item compartilhado até a pasta aberta'
  })
  breadcrumb!: PublicFolderCrumbDto[];

  @ApiProperty({ type: PublicShareItemDto, isArray: true })
  items!: PublicShareItemDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;
}
