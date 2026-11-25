import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export const DRIVE_INDEX_REFRESH_MODES = ['incremental', 'full'] as const;
export type DriveIndexRefreshMode = (typeof DRIVE_INDEX_REFRESH_MODES)[number];

export class RefreshDriveIndexRequestDto {
  @ApiPropertyOptional({
    enum: DRIVE_INDEX_REFRESH_MODES,
    default: 'incremental',
    description: 'incremental aplica apenas as mudanças desde a última indexação; full refaz a varredura inteira'
  })
  @IsOptional()
  @IsIn(DRIVE_INDEX_REFRESH_MODES)
  mode?: DriveIndexRefreshMode;
}
