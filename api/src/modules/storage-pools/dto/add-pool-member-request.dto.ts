import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class AddPoolMemberRequestDto {
  @ApiProperty({ format: 'uuid', description: 'Connection (provider integration) ID to add to the pool' })
  @IsUUID()
  connectionId!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 1, description: 'Routing weight for WEIGHTED strategy' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  weight?: number;
}
