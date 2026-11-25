import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength
} from 'class-validator';

export const SHARE_LINK_MAX_ITEMS = 500;

export class CreateShareLinkRequestDto {
  @ApiProperty({ format: 'uuid', description: 'Conexão Google Drive cujos itens serão compartilhados' })
  @IsUUID()
  connectionId!: string;

  @ApiProperty({
    type: [String],
    maxItems: SHARE_LINK_MAX_ITEMS,
    description: 'IDs (do Google Drive) dos arquivos, pastas ou drives compartilhados a disponibilizar',
    example: ['1AbCdEfGhIjKlMnOp']
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(SHARE_LINK_MAX_ITEMS)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(200, { each: true })
  fileIds!: string[];

  @ApiPropertyOptional({ example: 'Fotos do evento', maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  name?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 365, description: 'Validade em dias; omitido = sem expiração' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  expiresInDays?: number;
}
