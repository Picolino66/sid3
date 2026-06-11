import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateApiKeyRequestDto {
  @ApiProperty({ minLength: 2, example: 'Production integration' })
  @IsString()
  @MinLength(2)
  name!: string;
}
