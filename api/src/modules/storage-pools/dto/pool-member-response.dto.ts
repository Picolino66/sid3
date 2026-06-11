import { ApiProperty } from '@nestjs/swagger';
import { Provider, ProviderIntegrationStatus } from '@prisma/client';

export class PoolMemberResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  connectionId!: string;

  @ApiProperty({ enum: Provider })
  provider!: Provider;

  @ApiProperty({ nullable: true })
  displayName!: string | null;

  @ApiProperty({ nullable: true })
  providerAccountEmail!: string | null;

  @ApiProperty({ enum: ProviderIntegrationStatus })
  connectionStatus!: ProviderIntegrationStatus;

  @ApiProperty()
  weight!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}
