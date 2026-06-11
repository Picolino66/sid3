import { ApiProperty } from '@nestjs/swagger';
import { StorageObjectResponseDto } from './storage-object-response.dto';

export class ObjectListResponseDto {
  @ApiProperty({ type: StorageObjectResponseDto, isArray: true })
  items!: StorageObjectResponseDto[];

  @ApiProperty({ nullable: true })
  nextCursor!: string | null;
}
