import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'email', example: 'dev@example.com' })
  email!: string;

  @ApiProperty({ example: 'Independent Developer' })
  name!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}
