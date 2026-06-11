import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class UploadObjectRequestDto {
  @ApiProperty({ example: 'avatars/user-1.png' })
  @IsString()
  @MinLength(1)
  key!: string;
}
