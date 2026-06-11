import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  getHealth(): { status: 'ok'; service: 'sid3-api'; timestamp: string } {
    return {
      status: 'ok',
      service: 'sid3-api',
      timestamp: new Date().toISOString()
    };
  }
}
