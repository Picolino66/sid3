import { ApiPropertyOptional } from '@nestjs/swagger';
import { ApiProperty } from '@nestjs/swagger';

export class BucketResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty({ example: 'avatars' })
  name!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  providerIntegrationId!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  storagePoolId!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}
