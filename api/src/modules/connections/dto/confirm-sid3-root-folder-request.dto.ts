import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export type Sid3RootFolderDecision = 'CONFIRM' | 'DECLINE';

export class ConfirmSid3RootFolderRequestDto {
  @ApiProperty({
    enum: ['CONFIRM', 'DECLINE'],
    description:
      'CONFIRM reutiliza a pasta "sid3" pré-existente encontrada no Google Drive. DECLINE cria uma nova pasta "sid3" para uso exclusivo do SID3.'
  })
  @IsIn(['CONFIRM', 'DECLINE'])
  decision!: Sid3RootFolderDecision;
}
