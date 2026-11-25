import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class ListShareLinksQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Filtra pelos links de uma conexão' })
  @IsOptional()
  @IsUUID()
  connectionId?: string;
}
