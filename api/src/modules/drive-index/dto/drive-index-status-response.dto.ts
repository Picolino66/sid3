import { ApiProperty } from '@nestjs/swagger';
import { DriveIndexStatus } from '@prisma/client';

export class DriveIndexStatusResponseDto {
  @ApiProperty({ format: 'uuid' })
  connectionId!: string;

  @ApiProperty({ enum: DriveIndexStatus })
  status!: DriveIndexStatus;

  @ApiProperty({ description: 'A conexão tem escopo de leitura completa do Drive (drive.readonly ou drive)' })
  hasReadScope!: boolean;

  @ApiProperty({ format: 'date-time', nullable: true, description: 'Início da indexação em andamento' })
  startedAt!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true, description: 'Fim da última indexação concluída' })
  lastIndexedAt!: string | null;

  @ApiProperty({ example: 1532, description: 'Quantidade de itens (arquivos e pastas) no índice' })
  itemCount!: number;

  @ApiProperty({ nullable: true })
  lastError!: string | null;
}
