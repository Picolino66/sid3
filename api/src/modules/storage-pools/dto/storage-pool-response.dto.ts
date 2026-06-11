import { ApiProperty } from '@nestjs/swagger';
import { PoolRoutingStrategy } from '@prisma/client';
import { PoolMemberResponseDto } from './pool-member-response.dto';

export class StoragePoolResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: PoolRoutingStrategy })
  strategy!: PoolRoutingStrategy;

  @ApiProperty({ type: [PoolMemberResponseDto] })
  members!: PoolMemberResponseDto[];

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}
