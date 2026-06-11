import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterRequestDto {
  @ApiProperty({ example: 'dev@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 12, example: 'correct-horse-battery' })
  @IsString()
  @MinLength(12)
  password!: string;

  @ApiProperty({ minLength: 2, example: 'Independent Developer' })
  @IsString()
  @MinLength(2)
  name!: string;
}
