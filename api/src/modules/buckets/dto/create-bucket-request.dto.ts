import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class CreateBucketRequestDto {
  @ApiProperty({ example: 'avatars', pattern: '^[a-z0-9][a-z0-9-]{2,62}$' })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{2,62}$/)
  name!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Direct provider connection. Mutually exclusive with storagePoolId.' })
  @IsOptional()
  @IsUUID()
  providerIntegrationId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Storage pool for automatic routing. Mutually exclusive with providerIntegrationId.' })
  @IsOptional()
  @IsUUID()
  storagePoolId?: string;
}
