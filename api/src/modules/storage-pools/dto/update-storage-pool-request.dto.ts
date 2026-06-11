import { ApiPropertyOptional } from '@nestjs/swagger';
import { PoolRoutingStrategy } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateStoragePoolRequestDto {
  @ApiPropertyOptional({ example: 'my-pool', minLength: 1, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ enum: PoolRoutingStrategy })
  @IsOptional()
  @IsEnum(PoolRoutingStrategy)
  strategy?: PoolRoutingStrategy;
}
