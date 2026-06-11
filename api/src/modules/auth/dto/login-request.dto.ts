import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginRequestDto {
  @ApiProperty({ example: 'dev@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 12, example: 'correct-horse-battery' })
  @IsString()
  @MinLength(1)
  password!: string;
}
