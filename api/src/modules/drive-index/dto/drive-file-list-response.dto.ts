import { ApiProperty } from '@nestjs/swagger';
import { DriveFileResponseDto } from './drive-file-response.dto';

export const DRIVE_FILE_LIST_SECTIONS = ['my-drive', 'shared-drives', 'shared-with-me', 'search'] as const;
export type DriveFileListSection = (typeof DRIVE_FILE_LIST_SECTIONS)[number];

export class DriveFolderCrumbDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;
}

export class DriveFileListResponseDto {
  @ApiProperty({ type: DriveFileResponseDto, isArray: true })
  items!: DriveFileResponseDto[];

  @ApiProperty({ example: 120 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 50 })
  pageSize!: number;

  @ApiProperty({
    nullable: true,
    description: 'Pasta listada (root, shared, shared-drives ou ID de pasta). Nulo em buscas por nome.'
  })
  parentId!: string | null;

  @ApiProperty({
    enum: DRIVE_FILE_LIST_SECTIONS,
    description: 'Seção onde a pasta listada está: Meu Drive, Drives compartilhados, Compartilhados comigo ou busca'
  })
  section!: DriveFileListSection;

  @ApiProperty({
    type: DriveFolderCrumbDto,
    isArray: true,
    description: 'Caminho até a pasta listada; em drives compartilhados começa pelo drive. Vazio nas seções e em buscas'
  })
  breadcrumb!: DriveFolderCrumbDto[];
}
