import { ApiProperty } from '@nestjs/swagger';
import { StorageObjectResponseDto } from './storage-object-response.dto';

export class ObjectListResponseDto {
  @ApiProperty({ type: StorageObjectResponseDto, isArray: true })
  items!: StorageObjectResponseDto[];

  @ApiProperty({
    type: [String],
    description: 'Subpastas diretas do prefixo (apenas com delimiter=/ e na primeira página), ex.: "images/".'
  })
  folders!: string[];

  @ApiProperty({ nullable: true, description: 'Passe em `cursor` para buscar a próxima página.' })
  nextCursor!: string | null;
}
