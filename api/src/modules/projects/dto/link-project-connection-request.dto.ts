import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class LinkProjectConnectionRequestDto {
  @ApiProperty({ format: 'uuid', description: 'Conexão (de Conexões) que passa a ficar disponível no projeto' })
  @IsUUID()
  connectionId!: string;
}
