import { ApiProperty } from '@nestjs/swagger';

export class DriveFileResponseDto {
  @ApiProperty({ description: 'ID do arquivo no Google Drive', example: '1AbCdEfGhIjKlMnOp' })
  id!: string;

  @ApiProperty({ nullable: true, description: 'ID da pasta pai no Google Drive' })
  parentId!: string | null;

  @ApiProperty({ nullable: true, description: 'ID do drive compartilhado que contém o item; nulo em "Meu Drive"' })
  driveId!: string | null;

  @ApiProperty({ description: 'O item é o próprio drive compartilhado (pasta de topo)' })
  isSharedDrive!: boolean;

  @ApiProperty({ example: 'relatorio.pdf' })
  name!: string;

  @ApiProperty({ example: 'application/pdf' })
  mimeType!: string;

  @ApiProperty()
  isFolder!: boolean;

  @ApiProperty({ nullable: true, example: 20480, description: 'Nulo para pastas e arquivos nativos do Google' })
  sizeBytes!: number | null;

  @ApiProperty({ nullable: true })
  md5Checksum!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  modifiedTime!: string | null;

  @ApiProperty({ nullable: true, description: 'Link para abrir o arquivo no Google Drive' })
  webViewLink!: string | null;

  @ApiProperty({ description: 'Pode ser baixado pelo endpoint de download' })
  downloadable!: boolean;

  @ApiProperty({
    nullable: true,
    example: 'docx',
    description: 'Extensão usada na exportação de arquivos nativos do Google (Docs, Planilhas...)'
  })
  exportExtension!: string | null;

  @ApiProperty({ format: 'date-time' })
  indexedAt!: string;
}
