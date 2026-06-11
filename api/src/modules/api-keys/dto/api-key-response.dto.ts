import { ApiProperty } from '@nestjs/swagger';

export class ApiKeyResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Production integration' })
  name!: string;

  @ApiProperty({ example: '4f6a8c2b9e10' })
  prefix!: string;

  @ApiProperty({ format: 'date-time', nullable: true })
  lastUsedAt!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  revokedAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}
