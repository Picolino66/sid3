import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';

/**
 * Renomeia o bucket ou troca o destino dos próximos envios. Os arquivos já enviados continuam na conexão
 * onde foram gravados (cada arquivo registra a sua).
 */
export class UpdateBucketRequestDto {
  @ApiPropertyOptional({ example: 'fotos', pattern: '^[a-z0-9][a-z0-9-]{2,62}$' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{2,62}$/)
  name?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Novo destino direto. Mutuamente exclusivo com storagePoolId.' })
  @IsOptional()
  @IsUUID()
  providerIntegrationId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Novo destino via pool. Mutuamente exclusivo com providerIntegrationId.' })
  @IsOptional()
  @IsUUID()
  storagePoolId?: string;
}
