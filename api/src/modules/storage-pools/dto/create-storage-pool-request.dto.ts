import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PoolRoutingStrategy } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateStoragePoolRequestDto {
  @ApiProperty({ example: 'my-pool', minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ enum: PoolRoutingStrategy, default: PoolRoutingStrategy.ROUND_ROBIN })
  @IsOptional()
  @IsEnum(PoolRoutingStrategy)
  strategy?: PoolRoutingStrategy;
}
