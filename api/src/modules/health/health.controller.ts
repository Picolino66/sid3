import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';

type HealthResponse = {
  status: 'ok';
  service: 'sid3-api';
  timestamp: string;
};

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOkResponse({
    schema: {
      type: 'object',
      required: ['status', 'service', 'timestamp'],
      properties: {
        status: { type: 'string', enum: ['ok'] },
        service: { type: 'string', enum: ['sid3-api'] },
        timestamp: { type: 'string', format: 'date-time' }
      }
    }
  })
  getHealth(): HealthResponse {
    return this.healthService.getHealth();
  }
}
