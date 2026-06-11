import { ApiProperty } from '@nestjs/swagger';
import { OperationStatus, OperationType, Provider } from '@prisma/client';

export class OperationLogResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  apiKeyId!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  bucketId!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  objectId!: string | null;

  @ApiProperty({ enum: OperationType })
  operation!: OperationType;

  @ApiProperty({ enum: OperationStatus })
  status!: OperationStatus;

  @ApiProperty({ enum: Provider, nullable: true })
  provider!: Provider | null;

  @ApiProperty({ nullable: true })
  errorCode!: string | null;

  @ApiProperty()
  requestId!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}
