import { ApiProperty } from '@nestjs/swagger';

export class SignedDownloadUrlResponseDto {
  @ApiProperty({
    description: 'URL com token efêmero para download direto sem header de API Key',
    example: '/buckets/b1/objects/obj1/download?token=eyJhbGci...'
  })
  url!: string;

  @ApiProperty({
    description: 'Token assinado HMAC SHA-256',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  })
  token!: string;

  @ApiProperty({
    description: 'Data e hora ISO 8601 de expiração do token',
    example: '2026-09-25T01:00:00.000Z'
  })
  expiresAt!: string;

  @ApiProperty({
    description: 'Tempo de validade em segundos',
    example: 900
  })
  expiresInSeconds!: number;
}
