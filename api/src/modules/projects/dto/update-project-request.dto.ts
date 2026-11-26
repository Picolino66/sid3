import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateProjectRequestDto {
  @ApiProperty({ minLength: 2, maxLength: 100, example: 'Fotos da família' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;
}
