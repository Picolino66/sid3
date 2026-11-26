import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StorageObjectStatus } from '@prisma/client';

export class StorageObjectResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  bucketId!: string;

  @ApiProperty({ example: 'avatars/user-1.png' })
  key!: string;

  @ApiProperty({ example: 'user-1.png' })
  fileName!: string;

  @ApiProperty({ example: 'image/png' })
  contentType!: string;

  @ApiProperty({ example: 1024 })
  sizeBytes!: number;

  @ApiProperty({ nullable: true })
  checksumSha256!: string | null;

  @ApiProperty({ enum: StorageObjectStatus })
  status!: StorageObjectStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'URL assinada (1h) para visualizar/baixar. Só presente na listagem do painel (JWT).'
  })
  downloadUrl?: string | null;
}
