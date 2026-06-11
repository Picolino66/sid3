import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Provider, ProviderIntegrationStatus } from '@prisma/client';

export class ConnectionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: Provider })
  provider!: Provider;

  @ApiPropertyOptional({ nullable: true })
  displayName!: string | null;

  @ApiPropertyOptional({ format: 'email', nullable: true })
  providerAccountEmail!: string | null;

  @ApiProperty({ enum: ProviderIntegrationStatus })
  status!: ProviderIntegrationStatus;

  @ApiProperty({ type: [String] })
  scopes!: string[];

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}
