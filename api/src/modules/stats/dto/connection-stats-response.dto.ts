import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Provider, ProviderIntegrationStatus } from '@prisma/client';

export class ConnectionStorageSummaryDto {
  @ApiProperty({ format: 'uuid' })
  connectionId!: string;

  @ApiPropertyOptional({ nullable: true })
  displayName!: string | null;

  @ApiPropertyOptional({ format: 'email', nullable: true })
  providerAccountEmail!: string | null;

  @ApiProperty({ enum: Provider })
  provider!: Provider;

  @ApiProperty({ enum: ProviderIntegrationStatus })
  status!: ProviderIntegrationStatus;

  @ApiProperty({ description: 'Total bytes stored via this connection (as string to avoid JSON precision loss)' })
  sizeBytes!: string;

  @ApiProperty()
  objectCount!: number;

  @ApiPropertyOptional({ nullable: true, description: 'Total Drive storage limit in bytes (null = unlimited)' })
  driveQuotaLimitBytes!: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Total Drive storage usage in bytes' })
  driveQuotaUsageBytes!: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Drive storage usage by Drive files in bytes' })
  driveQuotaUsageInDriveBytes!: string | null;
}

export class ConnectionStatsResponseDto extends ConnectionStorageSummaryDto {}
