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
}

export class ConnectionStatsResponseDto extends ConnectionStorageSummaryDto {}
