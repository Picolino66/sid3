import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProviderIntegrationStatus, Sid3RootFolderStatus } from '@prisma/client';

export class ProjectConnectionResponseDto {
  @ApiProperty({ format: 'uuid', description: 'Id da conexão' })
  connectionId!: string;

  @ApiPropertyOptional({ nullable: true })
  displayName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  providerAccountEmail!: string | null;

  @ApiProperty({ enum: ProviderIntegrationStatus })
  status!: ProviderIntegrationStatus;

  @ApiProperty({ enum: Sid3RootFolderStatus })
  sid3RootFolderStatus!: Sid3RootFolderStatus;

  @ApiPropertyOptional({ nullable: true })
  lastError!: string | null;

  @ApiProperty({ description: 'Escopo de leitura do Drive inteiro concedido (habilita Meu Drive e links)' })
  canBrowseDrive!: boolean;

  @ApiProperty({ description: 'Buckets deste projeto que gravam diretamente nesta conexão' })
  bucketCount!: number;

  @ApiProperty({ format: 'date-time', description: 'Quando a conexão foi adicionada ao projeto' })
  linkedAt!: string;
}
