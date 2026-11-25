import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListDriveFilesQueryDto {
  @ApiPropertyOptional({
    description:
      'Pasta a listar: "root" (padrão, raiz do Meu Drive), "shared-drives" (lista de drives compartilhados), "shared" (itens compartilhados comigo sem pasta pai) ou o ID de uma pasta/drive compartilhado',
    example: 'root'
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  parentId?: string;

  @ApiPropertyOptional({ description: 'Busca por nome em todo o índice (ignora parentId)', example: 'contrato' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  q?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}
