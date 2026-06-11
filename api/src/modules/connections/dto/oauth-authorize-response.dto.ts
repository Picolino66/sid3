import { ApiProperty } from '@nestjs/swagger';

export class OAuthAuthorizeResponseDto {
  @ApiProperty({ format: 'uri' })
  authorizationUrl!: string;

  @ApiProperty({ format: 'date-time' })
  stateExpiresAt!: string;
}
