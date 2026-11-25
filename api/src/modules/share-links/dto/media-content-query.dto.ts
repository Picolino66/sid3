import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class MediaContentQueryDto {
  @ApiPropertyOptional({
    minimum: 0,
    description: 'Byte em que o arquivo "começa"; o header Range passa a ser relativo a ele (usado para avançar vídeos MPEG-TS)'
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  start?: number;
}
