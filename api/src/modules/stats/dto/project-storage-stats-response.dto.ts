import { ApiProperty } from '@nestjs/swagger';
import { ConnectionStorageSummaryDto } from './connection-stats-response.dto';

export class BucketStorageSummaryDto {
  @ApiProperty({ format: 'uuid' })
  bucketId!: string;

  @ApiProperty()
  bucketName!: string;

  @ApiProperty({ description: 'Total bytes in this bucket (as string)' })
  sizeBytes!: string;

  @ApiProperty()
  objectCount!: number;
}

export class ProjectStorageStatsResponseDto {
  @ApiProperty({ description: 'Total bytes across all buckets (as string)' })
  totalSizeBytes!: string;

  @ApiProperty()
  totalObjectCount!: number;

  @ApiProperty({ type: [ConnectionStorageSummaryDto] })
  byConnection!: ConnectionStorageSummaryDto[];

  @ApiProperty({ type: [BucketStorageSummaryDto] })
  byBucket!: BucketStorageSummaryDto[];
}
