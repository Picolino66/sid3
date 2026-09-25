import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Provider, ProviderIntegrationStatus, Sid3RootFolderStatus } from '@prisma/client';

export class ConnectionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: Provider })
  provider!: Provider;

  @ApiPropertyOptional({ nullable: true })
  displayName!: string | null;

  @ApiPropertyOptional({ format: 'email', nullable: true })
  providerAccountEmail!: string | null;

  @ApiProperty({ enum: ProviderIntegrationStatus })
  status!: ProviderIntegrationStatus;

  @ApiProperty({ type: [String] })
  scopes!: string[];

  @ApiProperty({
    enum: Sid3RootFolderStatus,
    description:
      'Estado da pasta raiz "sid3" desta conexão. PENDING_CONFIRMATION indica que o SID3 encontrou uma pasta "sid3" pré-existente no Google Drive e precisa que o usuário confirme ou recuse seu uso antes de novos uploads.'
  })
  sid3RootFolderStatus!: Sid3RootFolderStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}
