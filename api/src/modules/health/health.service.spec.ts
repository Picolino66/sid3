import { HealthService } from './health.service';

describe(HealthService.name, () => {
  it('returns the API health payload', () => {
    const service = new HealthService();

    const health = service.getHealth();

    expect(health.status).toBe('ok');
    expect(health.service).toBe('sid3-api');
    expect(Date.parse(health.timestamp)).not.toBeNaN();
  });
});
