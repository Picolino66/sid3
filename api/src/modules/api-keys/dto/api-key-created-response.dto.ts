import { ApiProperty } from '@nestjs/swagger';
import { ApiKeyResponseDto } from './api-key-response.dto';

export class ApiKeyCreatedResponseDto {
  @ApiProperty({ type: ApiKeyResponseDto })
  apiKey!: ApiKeyResponseDto;

  @ApiProperty({
    description: 'API key secret returned once. Store it securely; SID3 only stores its hash.',
    example: 'sid3_live_<prefix>_<secret>'
  })
  secret!: string;
}
