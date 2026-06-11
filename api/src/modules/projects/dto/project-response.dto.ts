import { ApiProperty } from '@nestjs/swagger';

export class ProjectResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Image Storage' })
  name!: string;

  @ApiProperty({ example: 'image-storage' })
  slug!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}
