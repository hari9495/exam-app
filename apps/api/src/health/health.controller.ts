import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from '@exam-platform/shared';

// Public by design -- external uptime monitoring cannot authenticate. There is no global
// auth guard in this app, so no exemption decorator is needed.
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  async check(@Res() res: Response): Promise<void> {
    const ok = await this.health.check();
    res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded' });
  }
}
