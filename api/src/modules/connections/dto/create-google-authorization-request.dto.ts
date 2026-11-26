import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateGoogleAuthorizationRequestDto {
  @ApiPropertyOptional({
    nullable: true,
    maxLength: 100,
    description: 'Nome da nova conexão. Vazio ou ausente usa "GOOGLE_DRIVE".'
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string | null;
}
