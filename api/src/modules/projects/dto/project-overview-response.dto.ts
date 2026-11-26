import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProjectAlertDto {
  @ApiProperty({ enum: ['critical', 'warning', 'info'] })
  severity!: 'critical' | 'warning' | 'info';

  @ApiProperty({ example: 'CONNECTION_REVOKED' })
  code!: string;

  @ApiProperty()
  message!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  connectionId!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  bucketId!: string | null;
}

export class ProjectTotalsDto {
  @ApiProperty()
  objectCount!: number;

  @ApiProperty()
  totalBytes!: number;

  @ApiProperty()
  bucketCount!: number;

  @ApiProperty()
  connectionCount!: number;

  @ApiProperty()
  activeApiKeyCount!: number;

  @ApiProperty({ description: 'Uploads com falha nas últimas 24h' })
  failedUploads24h!: number;

  @ApiProperty({ description: 'Uploads bem-sucedidos nas últimas 24h' })
  uploads24h!: number;
}

export class ProjectSetupDto {
  @ApiProperty()
  hasConnection!: boolean;

  @ApiProperty()
  hasBucket!: boolean;

  @ApiProperty()
  hasApiKey!: boolean;

  @ApiProperty()
  hasObject!: boolean;
}

export class ProjectOverviewResponseDto {
  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty()
  projectName!: string;

  @ApiProperty({ type: ProjectTotalsDto })
  totals!: ProjectTotalsDto;

  @ApiProperty({ type: ProjectSetupDto })
  setup!: ProjectSetupDto;

  @ApiProperty({ type: ProjectAlertDto, isArray: true })
  alerts!: ProjectAlertDto[];
}
