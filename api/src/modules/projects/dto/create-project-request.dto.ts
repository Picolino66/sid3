import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateProjectRequestDto {
  @ApiProperty({ minLength: 2, example: 'Image Storage' })
  @IsString()
  @MinLength(2)
  name!: string;
}
